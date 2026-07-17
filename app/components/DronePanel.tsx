"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useLiveGeolocation } from "../hooks/useLiveGeolocation";
import { evaluateDroneFlight } from "../lib/droneDecision";
import { reportDataUpdate } from "../lib/buildInfo";

const StableMap = dynamic(() => import("./StableMap"), { ssr: false });

type MetarReport = {
  rawOb?: string;
  temp?: number;
  dewp?: number;
  wdir?: number | string;
  wspd?: number;
  wgst?: number;
  visib?: number | string;
  altim?: number;
  flightCategory?: string;
  clouds?: Array<{ cover?: string; base?: number }>;
  wxString?: string;
};

type DroneTraffic = { id:string; callsign:string; latitude:number; longitude:number; barometricAltitude:number|null; velocity:number|null; trueTrack:number|null; aircraftType?:string|null; description?:string|null };
type NearbyPlace = { id: string; name: string; icao: string | null; kind: "aerodrome" | "heliport"; latitude: number; longitude: number; distanceKm: number; bearing: number };

const FRANCE_CENTER: [number, number] = [46.603354, 1.888334];

function distanceKm(origin: [number, number], destination: [number, number]) {
  const [lat1, lon1] = origin.map((value) => value * Math.PI / 180);
  const [lat2, lon2] = destination.map((value) => value * Math.PI / 180);
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function directionText(value?: number | string) {
  if (value === undefined || value === null) return "inconnue";
  if (typeof value === "string") return value === "VRB" ? "variable" : value;
  const names = ["Nord", "Nord-Est", "Est", "Sud-Est", "Sud", "Sud-Ouest", "Ouest", "Nord-Ouest"];
  return `${Math.round(value)}° — ${names[Math.round(value / 45) % 8]}`;
}

function visibilityText(value?: number | string) {
  if (value === undefined || value === null) return "non disponible";
  return typeof value === "number" ? `${Math.round(value * 1.60934)} km` : String(value);
}

function cloudText(clouds?: MetarReport["clouds"]) {
  if (!clouds?.length) return "aucun nuage significatif signalé";
  const labels: Record<string, string> = {
    FEW: "peu nuageux",
    SCT: "nuages épars",
    BKN: "nuages fragmentés",
    OVC: "couvert",
    VV: "visibilité verticale"
  };
  return clouds.map((cloud) => {
    const label = labels[cloud.cover ?? ""] ?? cloud.cover ?? "nuages";
    const altitude = typeof cloud.base === "number" ? ` vers ${Math.round(cloud.base * 0.3048)} m` : "";
    return `${label}${altitude}`;
  }).join(", ");
}

function categoryText(category?: string) {
  const labels: Record<string, string> = {
    VFR: "conditions favorables au vol à vue",
    MVFR: "conditions marginales pour le vol à vue",
    IFR: "conditions de vol aux instruments",
    LIFR: "conditions très dégradées"
  };
  return category ? labels[category] ?? category : "catégorie non disponible";
}

export default function DronePanel() {
  const [mapMode, setMapMode] = useState<"official" | "map">("map");
  const { position, status: positionStatus, accuracy, altitude, timestamp, isLive, trackingEnabled, setTrackingEnabled, error: gpsError } = useLiveGeolocation();
  const [metar, setMetar] = useState<MetarReport | null>(null);
  const [metarStatus, setMetarStatus] = useState("Chargement de la météo locale…");
  const [traffic, setTraffic] = useState<DroneTraffic[]>([]);
  const [lastUpdated, setLastUpdated] = useState("—");
  const [manualPoint, setManualPoint] = useState<[number, number] | null>(null);
  const [requestedHeight, setRequestedHeight] = useState(60);
  const [coordinateInput, setCoordinateInput] = useState("");
  const [commune, setCommune] = useState("");
  const [locationMessage, setLocationMessage] = useState("");
  const [nearbyPlaces, setNearbyPlaces] = useState<NearbyPlace[]>([]);

  const selectedPosition = manualPoint ?? position;
  const analysisCenter = selectedPosition ?? FRANCE_CENTER;

  useEffect(() => {
    let cancelled = false;
    async function loadMetar() {
      try {
        if (!selectedPosition) { setMetar(null); setMetarStatus("Point à sélectionner"); return; }
        const params = new URLSearchParams({ latitude: String(selectedPosition[0]), longitude: String(selectedPosition[1]), current: "temperature_2m,wind_speed_10m,wind_gusts_10m,visibility,surface_pressure,cloud_cover", wind_speed_unit: "kn", timezone: "auto" });
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { cache: "no-store" });
        const payload = await response.json();
        const current = payload.current;
        const report = current ? { temp: current.temperature_2m, wspd: current.wind_speed_10m, wgst: current.wind_gusts_10m, visib: typeof current.visibility === "number" ? current.visibility / 1609.34 : undefined, altim: current.surface_pressure } : null;
        if (!cancelled) {
          setMetar(report);
          setMetarStatus(response.ok && report ? "Open-Meteo au point exact" : "Météo indisponible");
          setLastUpdated(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
          reportDataUpdate("drone");
        }
      } catch {
        if (!cancelled) {
          setMetar(null);
          setMetarStatus("Météo locale indisponible");
        }
      }
    }
    loadMetar();
    const timer = window.setInterval(loadMetar, 10 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [selectedPosition]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedPosition) { setNearbyPlaces([]); return; }
    fetch(`/api/nearby-aeronautical-places?lat=${selectedPosition[0]}&lon=${selectedPosition[1]}`, { cache: "no-store" })
      .then((response) => response.json()).then((payload) => { if (!cancelled) setNearbyPlaces(Array.isArray(payload.places) ? payload.places : []); })
      .catch(() => { if (!cancelled) setNearbyPlaces([]); });
    return () => { cancelled = true; };
  }, [selectedPosition]);

  useEffect(() => {
    let cancelled = false;
    async function loadTraffic() {
      try {
        const response = await fetch(`/api/aircraft?lat=${analysisCenter[0]}&lon=${analysisCenter[1]}&radius=100`, { cache: "no-store" });
        const payload = await response.json();
        if (!cancelled) setTraffic(Array.isArray(payload.aircraft) ? payload.aircraft : []);
      } catch { if (!cancelled) setTraffic([]); }
    }
    loadTraffic(); const timer = window.setInterval(loadTraffic, 15000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [analysisCenter]);

  const nearbyTraffic = useMemo(() => traffic.map((item) => ({ ...item, distance: distanceKm(analysisCenter, [item.latitude, item.longitude]) })).sort((a,b) => a.distance-b.distance), [analysisCenter, traffic]);
  const alertTraffic = nearbyTraffic.filter((item) => item.distance <= 5 && (item.barometricAltitude ?? Infinity) <= 1500);

  const containingZones = useMemo(
    () => [],
    []
  );

  const decision = useMemo(() => evaluateDroneFlight({
    hasPosition: Boolean(selectedPosition),
    zones: [],
    aerodromeDistanceKm: nearbyPlaces.find((place) => place.kind === "aerodrome")?.distanceKm ?? null,
    requestedHeightM: requestedHeight,
    weatherAvailable: Boolean(metar),
    flightCategory: metar?.flightCategory,
    gustKnots: metar?.wgst ?? metar?.wspd,
    visibilityKm: typeof metar?.visib === "number" ? metar.visib * 1.60934 : null,
    restrictionsChecked: false,
    nearbyAircraftCount: alertTraffic.length
  }), [alertTraffic.length, metar, nearbyPlaces, requestedHeight, selectedPosition]);

  const ceilingMeters = useMemo(() => {
    const layers = metar?.clouds?.filter((cloud) => ["BKN", "OVC", "VV"].includes(cloud.cover ?? "") && typeof cloud.base === "number") ?? [];
    return layers.length ? Math.min(...layers.map((cloud) => (cloud.base ?? 0) * 0.3048)) : null;
  }, [metar]);

  const nearestAerodrome = nearbyPlaces.find((place) => place.kind === "aerodrome") ?? null;
  const nearestHeliport = nearbyPlaces.find((place) => place.kind === "heliport") ?? null;
  const checklist = [
    { label: "Position", state: selectedPosition ? "Conforme" : "À vérifier", detail: selectedPosition ? "Point d’analyse défini" : "GPS ou point manuel requis" },
    { label: "RTBA / espaces", state: "À vérifier", detail: "Contrôle SIA officiel requis" },
    { label: "NOTAM", state: "À vérifier", detail: "Récupération automatique indisponible" },
    { label: "Météo", state: !metar ? "À vérifier" : decision.level === "forbidden" ? "Bloquant" : "Conforme", detail: metar ? "Observation du point reçue" : "Donnée absente" },
    { label: "Hauteur", state: requestedHeight > 120 ? "Bloquant" : "Conforme", detail: requestedHeight > 120 ? "Hauteur supérieure à 120 m" : "Hauteur demandée ≤ 120 m" },
    { label: "Autorisation", state: "À vérifier", detail: "À confirmer par le télépilote" },
    { label: "Sécurité", state: decision.level === "forbidden" ? "Bloquant" : "À vérifier", detail: alertTraffic.length ? "Trafic proche détecté" : "Surveillance continue nécessaire" }
  ] as const;

  const message = !selectedPosition
    ? "Position GPS indisponible : recherchez une commune, saisissez des coordonnées ou cliquez sur la carte."
    : "Analyse du point sélectionné en France. Les NOTAM et espaces réglementés officiels restent à vérifier.";

  const mapPoints = [
    ...(selectedPosition ? [{
        id: manualPoint ? "selected-point" : "home",
        lat: selectedPosition[0],
        lon: selectedPosition[1],
        name: manualPoint ? "Point sélectionné" : "Votre position HOME",
        detail: manualPoint ? "Point choisi manuellement" : positionStatus,
        category: manualPoint ? "location" : "home"
      }] : []),
    ...nearbyPlaces.map((place) => ({ id: place.id, lat: place.latitude, lon: place.longitude, name: place.icao ?? place.name, detail: `${place.kind === "heliport" ? "Héliport" : "Aérodrome"} • ${place.name} • ${place.distanceKm.toFixed(1)} km`, category: "aerodrome" })),
    ...nearbyTraffic.map((item) => ({ id:`traffic-${item.id}`, lat:item.latitude, lon:item.longitude, name:item.callsign, detail:`Alt. ${item.barometricAltitude === null ? "Non déterminée" : `${Math.round(item.barometricAltitude)} m`} • ${item.velocity === null ? "Vitesse non déterminée" : `${Math.round(item.velocity*3.6)} km/h`} • ${item.trueTrack === null ? "Cap non déterminé" : `Cap ${Math.round(item.trueTrack)}°`}`, category:/heli|h145|ec145|h135|ec135/i.test(`${item.aircraftType ?? ""} ${item.description ?? ""}`) ? "helicopter" : "aircraft", heading:item.trueTrack }))
  ];

  function applyCoordinates() {
    const values = coordinateInput.split(/[;,\s]+/).map(Number).filter(Number.isFinite);
    if (values.length < 2 || values[0] < 41 || values[0] > 52 || values[1] < -6 || values[1] > 10) { setLocationMessage("Coordonnées invalides pour la France."); return; }
    setManualPoint([values[0], values[1]]); setLocationMessage("Coordonnées appliquées."); setMapMode("map");
  }

  async function searchCommune() {
    if (!commune.trim()) return;
    try {
      const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(commune)}&count=5&language=fr&countryCode=FR`);
      const payload = await response.json(); const result = payload.results?.[0];
      if (!result) { setLocationMessage("Commune introuvable."); return; }
      setManualPoint([result.latitude, result.longitude]); setLocationMessage(`${result.name}${result.admin1 ? ` — ${result.admin1}` : ""}`); setMapMode("map");
    } catch { setLocationMessage("Recherche de commune indisponible."); }
  }

  return (
    <>
      <section className="hero drone-hero-v4">
        <div>
          <span className="eyebrow">ASSISTANT TÉLÉPILOTE — FRANCE</span>
          <h1>Analyse opérationnelle nationale</h1>
          <p>GPS réel ou point manuel, trafic aérien, météo exacte et contrôles réglementaires.</p>
        </div>
        <div className={`drone-decision-status ${decision.level}`}>
          <span>{decision.level === "possible" ? "🟢" : decision.level === "forbidden" ? "🔴" : "🟠"}</span>
          <div><strong>{decision.label}</strong><small>Mise à jour {lastUpdated}</small></div>
        </div>
      </section>

      <section className={`panel drone-decision-panel ${decision.level}`}>
        <div><span className="eyebrow">AIDE À LA DÉCISION</span><h2>{decision.label}</h2><p>{message}</p></div>
        <ul>{decision.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
        <label>Hauteur demandée <input type="number" min="0" max="500" value={requestedHeight} onChange={(event) => setRequestedHeight(Math.max(0, Number(event.target.value) || 0))} /> m</label>
        <div className="drone-point-actions"><button type="button" disabled={!position} onClick={() => setManualPoint(null)}>📍 Utiliser HOME</button><small>{manualPoint ? `${manualPoint[0].toFixed(5)} / ${manualPoint[1].toFixed(5)}` : position ? "Position GPS réelle" : "Position GPS indisponible"}</small></div>
        <footer>Cette synthèse est une aide opérationnelle. Elle ne remplace pas la vérification réglementaire du télépilote (AZBA, NOTAM, SUP AIP, AIP et restrictions locales).</footer>
      </section>
      {alertTraffic.length > 0 && <section className="panel drone-traffic-alert"><strong>ALERTE TRAFIC À PROXIMITÉ</strong>{alertTraffic.slice(0,3).map((item) => <p key={item.id}><b>{item.callsign}</b> à {item.distance.toFixed(1)} km • Altitude {item.barometricAltitude === null ? "non déterminée" : `${Math.round(item.barometricAltitude)} m`} • Cap {item.trueTrack === null ? "non déterminé" : `${Math.round(item.trueTrack)}°`} • Vitesse {item.velocity === null ? "non déterminée" : `${Math.round(item.velocity*3.6)} km/h`}</p>)}</section>}

      <section className="drone-ops-overview">
        <article className="panel drone-synthesis">
          <header><span className="eyebrow">SYNTHÈSE OPÉRATIONNELLE</span><h3>Situation au point analysé</h3></header>
          <div>
            <p><span>GPS</span><strong>{selectedPosition ? manualPoint ? "Point manuel" : "Position réelle" : "Non disponible"}</strong></p>
            <p><span>Précision</span><strong>{!manualPoint && accuracy ? `±${Math.round(accuracy)} m` : "Non déterminé"}</strong></p>
            <p><span>Altitude demandée</span><strong>{requestedHeight} m</strong></p>
            <p><span>Vent</span><strong>{metar?.wspd !== undefined ? `${metar.wspd} kt` : "Non déterminé"}</strong></p>
            <p><span>Rafales</span><strong>{metar?.wgst !== undefined ? `${metar.wgst} kt` : "Non déterminé"}</strong></p>
            <p><span>Visibilité</span><strong>{metar?.visib !== undefined ? visibilityText(metar.visib) : "Non déterminé"}</strong></p>
            <p><span>Plafond</span><strong>{ceilingMeters !== null ? `${Math.round(ceilingMeters)} m` : "Non déterminé"}</strong></p>
            <p><span>Pluie</span><strong>{metar?.wxString ? metar.wxString : "Non déterminé"}</strong></p>
            <p><span>RTBA / espaces</span><strong>Vérification officielle requise</strong></p>
            <p><span>Aérodrome proche</span><strong>{nearestAerodrome ? `${nearestAerodrome.name} • ${nearestAerodrome.distanceKm.toFixed(1)} km • ${Math.round(nearestAerodrome.bearing)}°${nearestAerodrome.icao ? ` • ${nearestAerodrome.icao}` : ""}` : "Non déterminé"}</strong></p>
            <p><span>Héliport</span><strong>{nearestHeliport ? `${nearestHeliport.name} • ${nearestHeliport.distanceKm.toFixed(1)} km • ${Math.round(nearestHeliport.bearing)}°${nearestHeliport.icao ? ` • ${nearestHeliport.icao}` : ""}` : "Non déterminé"}</strong></p>
            <p><span>Mise à jour</span><strong>{lastUpdated}</strong></p>
          </div>
        </article>
        <article className="panel drone-checklist">
          <header><span className="eyebrow">CHECKLIST TÉLÉPILOTE</span><h3>Contrôles indispensables</h3></header>
          <div>{checklist.map((item) => <p key={item.label}><strong>{item.label}<small>{item.detail}</small></strong><span className={`check-state ${item.state.toLowerCase().replace(" ", "-").replace("à", "a")}`}>{item.state}</span></p>)}</div>
          <footer>Cette application constitue une aide à la décision et ne remplace pas la vérification réglementaire du télépilote.</footer>
        </article>
      </section>

      {gpsError && <div className="gps-banner-v5">📍 {gpsError}</div>}

      <section className="drone-console-v4">
        <article className="panel drone-map-card-v4">
          <div className="panel-title rtba-panel-title-v51">
            <div>
              <span className="eyebrow">ESPACE AÉRIEN FRANCE</span>
              <h3>Carte du point analysé</h3>
              <p className="muted">Trafic et aérodromes OpenStreetMap autour du point. L’AZBA officiel reste disponible séparément.</p>
            </div>
            <div className="rtba-mode-switch">
              <button type="button" className={mapMode === "official" ? "active" : ""} onClick={() => setMapMode("official")}>AZBA officiel live</button>
              <button type="button" className={mapMode === "map" ? "active" : ""} onClick={() => setMapMode("map")}>Carte France</button>
            </div>
            <div className="drone-map-actions"><button type="button" disabled={!position} onClick={() => { setManualPoint(null); setMapMode("map"); }}>Recentrer</button><button type="button" onClick={() => setTrackingEnabled(!trackingEnabled)}>{trackingEnabled ? "Désactiver suivi GPS" : "Activer suivi GPS"}</button></div>
          </div>

          <div className="drone-location-tools"><label>Commune <input value={commune} onChange={(event) => setCommune(event.target.value)} placeholder="Ex. Bordeaux" /><button type="button" onClick={searchCommune}>Rechercher</button></label><label>Latitude, longitude <input value={coordinateInput} onChange={(event) => setCoordinateInput(event.target.value)} placeholder="44.8378, -0.5792" /><button type="button" onClick={applyCoordinates}>Appliquer</button></label>{locationMessage && <small>{locationMessage}</small>}</div>

          {mapMode === "official" ? (
            <div className="azba-live-shell">
              <div className="azba-live-banner">
                <span><b>● OFFICIEL EN DIRECT</b> — rouge : active • bleu : inactive</span>
                <a href="https://www.sia.aviation-civile.gouv.fr/azbaEx/" target="_blank" rel="noreferrer">Ouvrir en plein écran ↗</a>
              </div>
              <iframe
                className="azba-live-frame"
                src="https://www.sia.aviation-civile.gouv.fr/azbaEx/"
                title="Carte officielle AZBA du SIA"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
              <div className="azba-frame-fallback">
                Si la carte officielle est bloquée par le navigateur, utilisez le bouton « Ouvrir en plein écran ».
              </div>
            </div>
          ) : (
            <>
              <div className="drone-map-v4 drone-map-locked-v5">
                <StableMap
                  points={mapPoints}
                  zones={[]}
                  center={analysisCenter}
                  zoom={selectedPosition ? 10 : 6}
                  mapVariant="layers"
                  onMapClick={(point) => setManualPoint(point)}
                />
              </div>
              <div className="rtba-legend-v4">
                <span className="unknown">Espaces réglementés : non reproduits sans source officielle fiable</span>
                <span>Pour les limites et couleurs exactes : mode AZBA officiel live.</span>
              </div>
            </>
          )}

          <div className="rtba-zone-list-v5"><article><span>⚠️</span><div><strong>NOTAM</strong><small>Vérification automatique indisponible — consulter la source officielle.</small></div></article><article><span>🛩️</span><div><strong>CTR, TMA, R, P, D, militaires et temporaires</strong><small>Consulter les cartes et publications officielles SIA avant toute décision.</small></div></article></div>
        </article>

        <aside className="drone-side-v4">
          <article className="panel rtba-check-card">
            <span className="eyebrow">GÉOLOCALISATION CONTINUE</span>
            <div className="check-row"><span>{isLive ? "🟢" : "🟠"}</span><div><strong>GPS</strong><small>{positionStatus}</small></div></div>
            <div className="check-row"><span>📍</span><div><strong>{manualPoint ? "Point sélectionné" : "HOME"}</strong><small>{selectedPosition ? `${selectedPosition[0].toFixed(5)} / ${selectedPosition[1].toFixed(5)}` : "Position GPS indisponible"}</small></div></div>
            <div className="check-row"><span>🧭</span><div><strong>Latitude / longitude</strong><small>{selectedPosition ? `${selectedPosition[0].toFixed(6)} / ${selectedPosition[1].toFixed(6)}` : "Position indisponible"}</small></div></div>
            <div className="check-row"><span>🎯</span><div><strong>Précision / altitude GPS</strong><small>{!manualPoint && accuracy ? `±${Math.round(accuracy)} m • ${altitude === null ? "altitude non disponible" : `${Math.round(altitude)} m`}` : "Point manuel"}</small></div></div>
            <div className="check-row"><span>🕒</span><div><strong>Dernière position</strong><small>{timestamp ? new Date(timestamp).toLocaleTimeString("fr-FR") : "Non disponible"}</small></div></div>
            <p className="safety-note">La carte est une aide de repérage. L’AZBA, les NOTAM, SUP AIP et AIP officiels restent prioritaires.</p>
          </article>

          <article className="panel metar-card-v4">
            <div className="panel-title">
              <div>
                <span className="eyebrow">MÉTÉO LOCALE INDICATIVE</span>
                <h3>Prévision Open-Meteo au point analysé</h3>
                <p className="muted">Ce produit n’est pas un METAR et ne remplace pas une observation aéronautique officielle.</p>
              </div>
              <span className="metar-status">{metarStatus}</span>
            </div>

            {metar ? (
              <>
                <div className="metar-grid-v4">
                  <div><span>Vent</span><strong>{directionText(metar.wdir)} • {metar.wspd ?? "—"} kt</strong></div>
                  <div><span>Rafales</span><strong>{metar.wgst ? `${metar.wgst} kt` : "aucune signalée"}</strong></div>
                  <div><span>Visibilité</span><strong>{visibilityText(metar.visib)}</strong></div>
                  <div><span>Nuages</span><strong>{cloudText(metar.clouds)}</strong></div>
                  <div><span>Température / rosée</span><strong>{metar.temp ?? "—"} °C / {metar.dewp ?? "—"} °C</strong></div>
                  <div><span>Pression</span><strong>{typeof metar.altim === "number" ? `${Math.round(metar.altim)} hPa` : "—"}</strong></div>
                  <div className="wide"><span>Lecture générale</span><strong>{categoryText(metar.flightCategory)}</strong></div>
                </div>
                {metar.wxString && <div className="weather-alert-v4">Phénomène signalé : {metar.wxString}</div>}
              {metar.rawOb && <details className="raw-report-v4"><summary>Voir la donnée brute</summary><code>{metar.rawOb}</code></details>}
              </>
            ) : (
              <div className="metar-empty">Aucune observation aéronautique disponible.</div>
            )}
          </article>
        </aside>
      </section>
    </>
  );
}
