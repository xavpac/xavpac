"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveGeolocation } from "../hooks/useLiveGeolocation";
import type { MapVariant } from "./StableMap";

const StableMap = dynamic(() => import("./StableMap"), { ssr: false });

type LiveAircraft = {
  id: string;
  callsign: string;
  country: string;
  longitude: number;
  latitude: number;
  barometricAltitude: number | null;
  geometricAltitude?: number | null;
  velocity: number | null;
  trueTrack: number | null;
  verticalRate?: number | null;
  onGround: boolean;
  squawk?: string | null;
  registration?: string | null;
  aircraftType?: string | null;
  description?: string | null;
  operator?: string | null;
  category?: string | null;
};

type AircraftWithDistance = LiveAircraft & { distance: number };
type Radius = 20 | 50 | 100;

function distanceKm(origin: [number, number], destination: [number, number]) {
  const [lat1, lon1] = origin.map((value) => (value * Math.PI) / 180);
  const [lat2, lon2] = destination.map((value) => (value * Math.PI) / 180);
  const deltaLat = lat2 - lat1;
  const deltaLon = lon2 - lon1;
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatAltitude(value: number | null) {
  return value === null ? "—" : `${Math.round(value)} m`;
}

function formatFlightLevel(value: number | null) {
  if (value === null) return "—";
  return `FL${Math.max(0, Math.round(value / 30.48)).toString().padStart(3, "0")}`;
}

function formatSpeed(value: number | null) {
  return value === null ? "—" : `${Math.round(value * 3.6)} km/h`;
}

function directionName(track: number | null) {
  if (track === null) return "—";
  const directions = ["Nord", "Nord-Est", "Est", "Sud-Est", "Sud", "Sud-Ouest", "Ouest", "Nord-Ouest"];
  return `${directions[Math.round(track / 45) % 8]} • ${Math.round(track)}°`;
}

function radarCoordinates(home: [number, number], aircraft: AircraftWithDistance, radius: number) {
  const latDelta = aircraft.latitude - home[0];
  const lonDelta = (aircraft.longitude - home[1]) * Math.cos((home[0] * Math.PI) / 180);
  const x = Math.max(-1, Math.min(1, (lonDelta * 111) / radius));
  const y = Math.max(-1, Math.min(1, (latDelta * 111) / radius));
  return { left: `${50 + x * 45}%`, top: `${50 - y * 45}%` };
}

function aircraftVisual(item: LiveAircraft) {
  const text = `${item.aircraftType ?? ""} ${item.description ?? ""} ${item.category ?? ""} ${item.operator ?? ""}`.toLowerCase();
  if (text.includes("heli") || text.includes("rotor")) {
    return { category: "helicopter", color: "#4fa8ff" };
  }
  if (/(military|armée|air force|fighter|rafale|mirage|trainer)/i.test(text)) {
    return { category: "military", color: "#ff5e78" };
  }
  if (/(cessna|piper|robin|cirrus|ultralight|ulm|glider)/i.test(text)) {
    return { category: "light", color: "#bc83ff" };
  }
  return { category: "commercial", color: "#ffb34d" };
}

export default function AviationPanel() {
  const { position, status: positionStatus, isLive, error: gpsError } = useLiveGeolocation();
  const [radius, setRadius] = useState<Radius>(50);
  const [mapVariant, setMapVariant] = useState<MapVariant>("street");
  const [showTrails, setShowTrails] = useState(true);
  const [showRadius, setShowRadius] = useState(true);
  const [aircraft, setAircraft] = useState<AircraftWithDistance[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [manualSelection, setManualSelection] = useState(false);
  const [sourceStatus, setSourceStatus] = useState("Connexion Airplanes.live…");
  const [lastUpdate, setLastUpdate] = useState("—");
  const [error, setError] = useState("");
  const trailsRef = useRef<Record<string, [number, number][]>>({});
  const [trailsVersion, setTrailsVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        setError("");
        const response = await fetch(
          `/api/aircraft?lat=${position[0]}&lon=${position[1]}&radius=${radius}`,
          { cache: "no-store" }
        );
        const payload = await response.json();
        if (cancelled) return;

        const sorted: AircraftWithDistance[] = (Array.isArray(payload.aircraft) ? payload.aircraft : [])
          .map((item: LiveAircraft) => ({
            ...item,
            distance: distanceKm(position, [item.latitude, item.longitude])
          }))
          .filter((item: AircraftWithDistance) => item.distance <= radius + 1)
          .sort((a: AircraftWithDistance, b: AircraftWithDistance) => a.distance - b.distance);

        setAircraft(sorted);
        setLastUpdate(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));

        if (sorted.length === 0) {
          setSelectedId(null);
          setManualSelection(false);
        } else if (!manualSelection || !sorted.some((item) => item.id === selectedId)) {
          setSelectedId(sorted[0].id);
          setManualSelection(false);
        }

        for (const item of sorted.slice(0, 60)) {
          const current = trailsRef.current[item.id] ?? [];
          const nextPoint: [number, number] = [item.latitude, item.longitude];
          const previousPoint = current[current.length - 1];
          const isNew =
            !previousPoint ||
            Math.abs(previousPoint[0] - nextPoint[0]) > 0.00005 ||
            Math.abs(previousPoint[1] - nextPoint[1]) > 0.00005;
          trailsRef.current[item.id] = isNew ? [...current, nextPoint].slice(-40) : current;
        }
        setTrailsVersion((value) => value + 1);

        const source = typeof payload.source === "string" ? payload.source : "Airplanes.live";
        setSourceStatus(response.ok ? `${source} • ${sorted.length} appareil${sorted.length > 1 ? "s" : ""}` : `${source} indisponible`);
        if (!response.ok) setError(payload.error ?? "Source aérienne indisponible.");
      } catch {
        if (!cancelled) {
          setAircraft([]);
          setSelectedId(null);
          setSourceStatus("Airplanes.live indisponible");
          setError("Impossible de récupérer le trafic aérien en direct.");
        }
      }
    }

    refresh();
    const timer = window.setInterval(refresh, 12000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [position, radius, manualSelection, selectedId]);

  const selected = useMemo(
    () => aircraft.find((item) => item.id === selectedId) ?? aircraft[0] ?? null,
    [aircraft, selectedId]
  );

  const mapPoints = useMemo(
    () => [
      {
        id: "home",
        lat: position[0],
        lon: position[1],
        name: "Votre position",
        detail: positionStatus,
        color: "#3aa7ff",
        category: "home"
      },
      ...aircraft.slice(0, 80).map((item) => {
        const visual = aircraftVisual(item);
        return {
          id: item.id,
          lat: item.latitude,
          lon: item.longitude,
          name: item.callsign,
          detail: `${item.aircraftType ?? "Type inconnu"} • ${formatFlightLevel(item.barometricAltitude)} • ${formatSpeed(item.velocity)}`,
          color: item.id === selected?.id ? "#63ddff" : visual.color,
          category: visual.category,
          heading: item.trueTrack
        };
      })
    ],
    [aircraft, position, positionStatus, selected]
  );

  const mapTrails = useMemo(
    () =>
      aircraft.slice(0, 30).flatMap((item) => {
        const positions = trailsRef.current[item.id] ?? [];
        if (positions.length < 2) return [];
        const visual = aircraftVisual(item);
        return [{
          id: item.id,
          positions,
          color: item.id === selected?.id ? "#63ddff" : visual.color,
          selected: item.id === selected?.id
        }];
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [aircraft, selected, trailsVersion]
  );

  function selectAircraft(id: string) {
    if (id === "home") return;
    setSelectedId(id);
    setManualSelection(true);
  }

  return (
    <section className="aviation-console aviation-flightwall-v51">
      <div className="aviation-map-shell panel">
        <div className="aviation-pro-heading">
          <div>
            <span className="eyebrow">FLIGHTWALL AVIATION</span>
            <h2>Trafic réel autour de votre position</h2>
            <p>Carte lisible, avion le plus proche suivi automatiquement et fiche détaillée.</p>
          </div>
          <span className="aviation-pro-badge">CARTE MULTICOUCHE</span>
        </div>
        <div className="aviation-toolbar">
          <div className="toolbar-group">
            {[20, 50, 100].map((value) => (
              <button
                type="button"
                key={value}
                className={radius === value ? "tool-button active" : "tool-button"}
                onClick={() => setRadius(value as Radius)}
              >
                {value} km
              </button>
            ))}
          </div>
          <div className="toolbar-group aviation-map-controls">
            <button type="button" className={mapVariant === "street" ? "tool-button active" : "tool-button"} onClick={() => setMapVariant("street")}>Plan lisible</button>
            <button type="button" className={mapVariant === "satellite" ? "tool-button active" : "tool-button"} onClick={() => setMapVariant("satellite")}>Satellite</button>
            <button type="button" className={mapVariant === "dark" ? "tool-button active" : "tool-button"} onClick={() => setMapVariant("dark")}>Sombre</button>
            <button type="button" className={showTrails ? "tool-button active" : "tool-button"} onClick={() => setShowTrails((value) => !value)}>Traces</button>
            <button type="button" className={showRadius ? "tool-button active" : "tool-button"} onClick={() => setShowRadius((value) => !value)}>Cercle</button>
          </div>
          <div className="toolbar-group right-tools">
            <span className="source-chip">✈ {aircraft.length}</span>
            <span className={isLive ? "source-chip gps-live" : "source-chip"}>📍 {positionStatus}</span>
            <span className="source-chip live">● {sourceStatus}</span>
          </div>
        </div>

        {(gpsError || error) && (
          <div className="aviation-warning-v5">{gpsError || error}</div>
        )}

        <div className="aviation-map-stage">
          <StableMap
            points={mapPoints}
            center={position}
            radiusKm={radius}
            selectedId={selected?.id}
            trails={showTrails ? mapTrails : []}
            onSelect={selectAircraft}
            showRadius={showRadius}
            mapVariant={mapVariant}
          />

          <div className="map-radar-card">
            <div className="radar-title"><strong>Radar local</strong><span>{radius} km</span></div>
            <div className="mini-radar">
              <span className="radar-axis horizontal" />
              <span className="radar-axis vertical" />
              <span className="radar-circle one" />
              <span className="radar-circle two" />
              <span className="radar-circle three" />
              <span className="radar-center" />
              {aircraft.slice(0, 16).map((item) => {
                const coordinate = radarCoordinates(position, item, radius);
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={item.id === selected?.id ? "radar-blip selected" : "radar-blip"}
                    style={coordinate}
                    title={item.callsign}
                    onClick={() => selectAircraft(item.id)}
                  />
                );
              })}
            </div>
          </div>

          <div className="map-nearest-card">
            <div className="nearest-head">
              <strong>5 appareils les plus proches</strong>
              <button type="button" onClick={() => { setManualSelection(false); setSelectedId(aircraft[0]?.id ?? null); }}>
                Suivre le plus proche
              </button>
            </div>
            {aircraft.length ? (
              aircraft.slice(0, 5).map((item, index) => (
                <button
                  type="button"
                  key={item.id}
                  className={item.id === selected?.id ? "nearest-row selected" : "nearest-row"}
                  onClick={() => selectAircraft(item.id)}
                >
                  <b>{index + 1}</b>
                  <span><strong>{item.callsign}</strong><small>{item.aircraftType ?? item.registration ?? "ADS-B"}</small></span>
                  <span>{formatFlightLevel(item.barometricAltitude)}</span>
                  <span>{formatSpeed(item.velocity)}</span>
                  <em>{item.distance.toFixed(1)} km</em>
                </button>
              ))
            ) : (
              <div className="nearest-empty">Aucun avion détecté dans ce rayon.</div>
            )}
          </div>
        </div>

        <div className="map-footer-line">
          <span>Données aériennes : Airplanes.live</span>
          <span>Actualisation : {lastUpdate}</span>
          <span>Aucun METAR n’est affiché dans l’onglet Aviation.</span>
        </div>
      </div>

      <aside className="aircraft-focus panel">
        {selected ? (
          <>
            <div className="focus-title">
              <div>
                <span className="eyebrow">AVION DU MOMENT</span>
                <h2>{selected.callsign}</h2>
                <p>{selected.operator ?? selected.country ?? "Donnée ADS-B publique"}</p>
              </div>
              <div className="focus-plane">✈</div>
            </div>

            <div className="focus-identity">
              <div className="identity-logo">{(selected.operator ?? selected.callsign).slice(0, 1)}</div>
              <div>
                <strong>{selected.registration ?? selected.callsign}</strong>
                <span>{selected.aircraftType ?? selected.description ?? "Type non disponible"}</span>
              </div>
            </div>

            <div className="focus-status-card">
              <span>📡 Position reçue en direct</span>
              <h3>{selected.distance.toFixed(1)} km</h3>
              <p>{selected.onGround ? "Appareil au sol" : "Appareil en vol"}</p>
            </div>

            <div className="focus-grid">
              <div><span>Altitude</span><strong>{formatAltitude(selected.barometricAltitude)}</strong></div>
              <div><span>Niveau</span><strong>{formatFlightLevel(selected.barometricAltitude)}</strong></div>
              <div><span>Vitesse sol</span><strong>{formatSpeed(selected.velocity)}</strong></div>
              <div><span>Cap</span><strong>{directionName(selected.trueTrack)}</strong></div>
              <div><span>Immatriculation</span><strong>{selected.registration ?? "—"}</strong></div>
              <div><span>Transpondeur</span><strong>{selected.squawk ?? "—"}</strong></div>
            </div>

            <div className="data-honesty">
              <strong>Informations fiables uniquement</strong>
              <p>Le départ, l’arrivée et la compagnie ne sont affichés que lorsqu’une source les fournit. XavPac n’invente aucune route.</p>
            </div>
          </>
        ) : (
          <div className="focus-empty">
            <span>✈</span>
            <h2>Aucun avion détecté</h2>
            <p>Aucun appareil ADS-B n’est reçu dans un rayon de {radius} km.</p>
            <small>{sourceStatus}</small>
          </div>
        )}
      </aside>
    </section>
  );
}
