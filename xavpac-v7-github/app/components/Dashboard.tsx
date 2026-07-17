"use client";

import { useEffect, useMemo, useState } from "react";
import type { Aircraft, GeoPosition, ModuleId } from "../types";
import { demoAviation, demoNational } from "../data/demo";
import {
  altitudeLabel,
  cardinalDirection,
  formatClock,
  formatDate,
  isNationalAircraft,
  kmhFromKnots,
  metersFromFeet,
} from "../data/aircraft";
import FlightMap from "./FlightMap";
import MiniRadar from "./MiniRadar";

type ApiAircraft = {
  id: string;
  hex: string;
  callsign: string;
  registration: string;
  type: string;
  typeLabel: string;
  operator: string;
  category: Aircraft["category"];
  latitude: number;
  longitude: number;
  altitudeFt: number | null;
  groundSpeedKt: number | null;
  trackDeg: number | null;
  verticalRateFpm: number | null;
  distanceKm: number;
  bearingDeg: number;
  onGround: boolean;
  source: string;
  lastSeen: string;
};

const modules = [
  { id: "aviation", icon: "✈", label: "AVIATION", sub: "Avions en vol" },
  { id: "national", icon: "🚁", label: "MOYENS NATIONAUX", sub: "Sécurité civile & État" },
  { id: "drone", icon: "⌁", label: "DRONE", sub: "Zones & RTBA" },
  { id: "codis", icon: "🚒", label: "CODIS", sub: "Centre opérationnel" },
  { id: "weather", icon: "🌤", label: "MÉTÉO", sub: "Prévisions" },
  { id: "space", icon: "◔", label: "ASTRONOMIE", sub: "Ciel & étoiles" },
];

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function LoadingBadge({ live, demo, error }: { live: boolean; demo: boolean; error: string | null }) {
  if (demo) return <span className="system-badge warning"><i /> Aperçu visuel</span>;
  if (error) return <span className="system-badge danger"><i /> Flux indisponible</span>;
  if (!live) return <span className="system-badge"><i /> Connexion…</span>;
  return <span className="system-badge success"><i /> Système actif</span>;
}

function StatRail({ aircraft, position }: { aircraft: Aircraft[]; position: GeoPosition | null }) {
  const airborne = aircraft.filter((item) => !item.onGround).length;
  const approaching = aircraft.filter((item) => (item.verticalRateFpm ?? 0) < -300).length;
  const ground = aircraft.filter((item) => item.onGround).length;
  return (
    <aside className="map-stat-rail">
      <div className="map-stat"><span>✈</span><strong>{airborne}</strong><small>En vol</small></div>
      <div className="map-stat"><span>🎯</span><strong>{approaching}</strong><small>En approche</small></div>
      <div className="map-stat"><span>🛩</span><strong>{ground}</strong><small>Au sol</small></div>
      <div className="map-stat"><span>◉</span><strong>{aircraft.length ? 1 : 0}</strong><small>Radar(s)</small></div>
      <div className={`map-stat home ${position ? "ready" : ""}`}><span>📍</span><strong>HOME</strong><small>{position ? "Ma position" : "GPS requis"}</small></div>
    </aside>
  );
}

function AltitudeBars({ aircraft }: { aircraft: Aircraft[] }) {
  const groups = [
    { label: "FL400+", min: 40000, max: Infinity },
    { label: "FL300 - FL399", min: 30000, max: 39999 },
    { label: "FL200 - FL299", min: 20000, max: 29999 },
    { label: "FL100 - FL199", min: 10000, max: 19999 },
    { label: "FL000 - FL099", min: 0, max: 9999 },
  ].map((group) => ({
    ...group,
    count: aircraft.filter((item) => item.altitudeFt !== null && item.altitudeFt >= group.min && item.altitudeFt <= group.max).length,
  }));
  const max = Math.max(...groups.map((group) => group.count), 1);
  return (
    <div className="altitude-bars">
      {groups.map((group, index) => (
        <div className="altitude-row" key={group.label}>
          <span>{group.label}</span>
          <div><i className={`bar-${index}`} style={{ width: `${Math.max((group.count / max) * 100, group.count ? 15 : 0)}%` }} /></div>
          <strong>{group.count}</strong>
        </div>
      ))}
    </div>
  );
}

function AircraftArtwork({ selected }: { selected: Aircraft | null }) {
  const type = selected?.category ?? "airliner";
  const icon = type === "helicopter" || type === "medical" ? "🚁" : type === "water-bomber" ? "🛩️" : type === "military" ? "🛫" : "✈️";
  return (
    <div className={`aircraft-artwork ${type}`}>
      <div className="art-sun" />
      <div className="art-cloud cloud-one" />
      <div className="art-cloud cloud-two" />
      <span>{icon}</span>
      <small>Illustration XavPac</small>
    </div>
  );
}

function DetailPanel({ selected, module }: { selected: Aircraft | null; module: ModuleId }) {
  if (!selected) {
    return (
      <aside className="detail-panel empty-detail">
        <div className="empty-visual">✈</div>
        <h2>Aucun appareil sélectionné</h2>
        <p>Choisis un appareil sur la carte ou dans la liste des plus proches.</p>
      </aside>
    );
  }
  const altitudeM = metersFromFeet(selected.altitudeFt);
  const speedKmh = kmhFromKnots(selected.groundSpeedKt);
  const route = selected.route;
  return (
    <aside className="detail-panel">
      <section className="detail-hero">
        <div>
          <span className="eyebrow">{module === "aviation" ? "Avion du moment" : "Moyen sélectionné"}</span>
          <h2>{selected.callsign || selected.registration}</h2>
          <div className="operator-line"><b>{selected.operator || "Opérateur non renseigné"}</b><em>{selected.type}</em></div>
          <p>{selected.typeLabel || selected.type || "Type non renseigné"}</p>
        </div>
        <AircraftArtwork selected={selected} />
      </section>

      <section className="identity-grid">
        <div><span>◔ Compagnie / organisme</span><strong>{selected.operator || "—"}</strong></div>
        <div><span>✈ Type</span><strong>{selected.typeLabel || selected.type || "—"}</strong></div>
        <div><span>Immatriculation</span><strong>{selected.registration || "—"}</strong></div>
      </section>

      <section className="passage-card">
        <div>
          <span>{module === "aviation" ? "🏠 Passage au plus près de la maison" : "🚨 Situation du moyen"}</span>
          <h3>{module === "aviation" ? "Passage détecté" : selected.mission || "Mission non diffusée"}</h3>
          <p>{selected.distanceKm ? `Appareil à ${selected.distanceKm.toFixed(1)} km de la position.` : "Distance indisponible."}</p>
        </div>
        <div className="passage-metric"><span>Distance</span><strong>{selected.distanceKm.toFixed(1)} km</strong><small>Cap {selected.trackDeg ?? "—"}°</small></div>
      </section>

      <section className="quick-grid">
        <div><span>Où regarder ?</span><strong>{cardinalDirection(selected.bearingDeg)}</strong></div>
        <div><span>Hauteur</span><strong>{Math.round(selected.bearingDeg / 4)}°</strong></div>
        <div><span>Distance actuelle</span><strong>{selected.distanceKm.toFixed(1)} km</strong></div>
        <div><span>Vitesse sol</span><strong>{selected.groundSpeedKt ? `${Math.round(selected.groundSpeedKt)} kts` : "—"}</strong></div>
      </section>

      {route ? (
        <section className="route-card">
          <div><span>Départ</span><strong>{route.fromCode}</strong><p>{route.fromName}<br />{route.fromCountry}</p><b>{route.departureLocal}</b><small>Locale</small></div>
          <div className="route-line"><span>✈</span><i /><span>✈</span><small>{route.duration}</small></div>
          <div className="route-destination"><span>Arrivée</span><strong>{route.toCode}</strong><p>{route.toName}<br />{route.toCountry}</p><b>{route.arrivalLocal}</b><small>Locale</small></div>
        </section>
      ) : (
        <section className="route-card compact-route">
          <div><span>Mission</span><strong>{selected.mission || "Non diffusée"}</strong><p>Les informations opérationnelles ne sont affichées que lorsqu’elles sont publiques.</p></div>
          <div className="route-destination"><span>Position</span><strong>{selected.distanceKm.toFixed(1)} km</strong><p>{cardinalDirection(selected.bearingDeg)} de HOME</p></div>
        </section>
      )}

      <section className="flight-data-grid">
        <div><span>Altitude</span><strong>{altitudeLabel(selected.altitudeFt)}</strong><small>{altitudeM !== null ? `${altitudeM.toLocaleString("fr-FR")} m` : "—"}</small></div>
        <div><span>Vitesse</span><strong>{selected.groundSpeedKt ? `${Math.round(selected.groundSpeedKt)} kts` : "—"}</strong><small>{speedKmh !== null ? `${speedKmh} km/h` : "—"}</small></div>
        <div><span>Cap</span><strong>{selected.trackDeg !== null ? `${Math.round(selected.trackDeg)}°` : "—"}</strong><small>{cardinalDirection(selected.trackDeg)}</small></div>
        <div><span>Verticale</span><strong>{selected.verticalRateFpm !== null ? `${Math.round(selected.verticalRateFpm)} ft/min` : "—"}</strong><small>{selected.verticalRateFpm === 0 ? "Palier" : selected.verticalRateFpm && selected.verticalRateFpm > 0 ? "Montée" : "Descente"}</small></div>
      </section>

      <section className="source-grid">
        <div><span>Suivi radar</span><strong>Airplanes.live</strong></div>
        <div><span>Source</span><strong>{selected.source}</strong></div>
        <div><span>Dernière MÀJ</span><strong>{selected.lastSeen}</strong></div>
        <div><span>N° de vol</span><strong>{selected.callsign || "—"}</strong></div>
      </section>
    </aside>
  );
}

export default function Dashboard({ initialDemo = false }: { initialDemo?: boolean }) {
  const now = useClock();
  const [module, setModule] = useState<ModuleId>("aviation");
  const [position, setPosition] = useState<GeoPosition | null>(null);
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showTraces, setShowTraces] = useState(true);
  const [showCircles, setShowCircles] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(initialDemo);

  useEffect(() => {
    setDemoMode(new URLSearchParams(window.location.search).get("demo") === "1");
  }, []);

  useEffect(() => {
    if (demoMode) {
      const next = module === "aviation" ? demoAviation : demoNational;
      setAircraft(next);
      setSelectedId(next[0]?.id ?? null);
      setLoading(false);
      setError(null);
      return;
    }

    if (!navigator.geolocation) {
      setLoading(false);
      setError("Géolocalisation indisponible sur cet appareil.");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (result) => {
        setPosition({
          latitude: result.coords.latitude,
          longitude: result.coords.longitude,
          accuracy: result.coords.accuracy,
        });
        setError(null);
      },
      (geoError) => {
        setLoading(false);
        setError(geoError.code === 1 ? "Autorisation GPS refusée." : "Position GPS indisponible.");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [demoMode, module]);

  useEffect(() => {
    if (demoMode || !position) return;
    let disposed = false;
    let timer: number | undefined;

    async function load() {
      try {
        setLoading(true);
        const response = await fetch(`/api/aircraft?lat=${position!.latitude}&lon=${position!.longitude}&radius=150`, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = (await response.json()) as { aircraft: ApiAircraft[] };
        if (disposed) return;
        const all = payload.aircraft;
        const next = module === "aviation" ? all.filter((item) => !isNationalAircraft(item)) : all.filter(isNationalAircraft);
        setAircraft(next);
        setSelectedId((current) => (next.some((item) => item.id === current) ? current : next[0]?.id ?? null));
        setError(null);
      } catch {
        if (!disposed) setError("Le flux ADS-B ne répond pas pour le moment.");
      } finally {
        if (!disposed) setLoading(false);
      }
    }

    load();
    timer = window.setInterval(load, 15000);
    return () => {
      disposed = true;
      if (timer) window.clearInterval(timer);
    };
  }, [demoMode, module, position]);

  const filteredAircraft = useMemo(() => {
    const query = search.trim().toUpperCase();
    if (!query) return aircraft;
    return aircraft.filter((item) => `${item.callsign} ${item.registration} ${item.type} ${item.operator}`.toUpperCase().includes(query));
  }, [aircraft, search]);

  const selected = filteredAircraft.find((item) => item.id === selectedId) ?? filteredAircraft[0] ?? null;
  const closest = [...filteredAircraft].sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 5);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-plane">✈</span><div><h1>XavPac <b>V7</b></h1><p>Aviation, drone et appui opérationnel</p></div></div>
        <div className="toolbar">
          <button className={showTraces ? "active" : ""} onClick={() => setShowTraces((value) => !value)}>🧵 Traces</button>
          <button className={showCircles ? "active" : ""} onClick={() => setShowCircles((value) => !value)}>🎯 Cercles</button>
          <button className={filtersOpen ? "active" : ""} onClick={() => setFiltersOpen((value) => !value)}>🔎 Filtres</button>
          <button>🔔 Alertes <span className="alert-count">3</span></button>
        </div>
        <div className="clock"><strong>{formatClock(now)}</strong><span>{formatDate(now)}</span></div>
        <LoadingBadge live={!loading && !error} demo={demoMode} error={error} />
      </header>

      <nav className="module-nav" aria-label="Modules XavPac">
        {modules.map((item) => {
          const enabled = item.id === "aviation" || item.id === "national";
          return (
            <button
              key={item.id}
              className={`${module === item.id ? "active" : ""} ${enabled ? "" : "disabled"}`}
              onClick={() => enabled && setModule(item.id as ModuleId)}
              title={enabled ? item.label : "Module en préparation"}
            >
              <span>{item.icon}</span><div><strong>{item.label}</strong><small>{item.sub}</small></div>
            </button>
          );
        })}
      </nav>

      {filtersOpen ? (
        <section className="filter-strip">
          <label>Recherche <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="vol, immatriculation, type…" /></label>
          <span>{filteredAircraft.length} appareil(s) affiché(s)</span>
          {!demoMode ? <button onClick={() => window.location.assign(`${window.location.pathname}?demo=1`)}>Voir l’aperçu visuel</button> : <button onClick={() => window.location.assign(window.location.pathname)}>Quitter l’aperçu</button>}
        </section>
      ) : null}

      <section className="dashboard-grid">
        <div className="left-column">
          <section className="map-panel">
            <FlightMap
              aircraft={filteredAircraft}
              selectedId={selected?.id ?? null}
              onSelect={(item) => setSelectedId(item.id)}
              position={position}
              showTraces={showTraces}
              showCircles={showCircles}
            />
            <div className="map-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un vol, un appareil, un call sign…" /></div>
            <div className="range-chip">100 NM</div>
            <div className="layers-chip">▱</div>
            <StatRail aircraft={filteredAircraft} position={position} />
            {!position && !demoMode ? <div className="gps-message"><strong>📍 Active la localisation précise</strong><span>La carte reste visible, mais le trafic proche nécessite ta position.</span></div> : null}
          </section>

          <section className="bottom-widgets">
            <article className="widget radar-widget">
              <header><div><h3>Mini radar local</h3><p>Rayon 50 km</p></div></header>
              <div className="radar-layout">
                <MiniRadar aircraft={filteredAircraft} />
                <div className="radar-stats"><div><span>≤ 5 km</span><strong>{filteredAircraft.filter((item) => item.distanceKm <= 5).length}</strong></div><div><span>≤ 10 km</span><strong>{filteredAircraft.filter((item) => item.distanceKm <= 10).length}</strong></div><div><span>≤ 25 km</span><strong>{filteredAircraft.filter((item) => item.distanceKm <= 25).length}</strong></div><div><span>≤ 50 km</span><strong>{filteredAircraft.filter((item) => item.distanceKm <= 50).length}</strong></div><div className="closest-stat"><span>Le plus proche</span><strong>{closest[0] ? `${closest[0].distanceKm.toFixed(1)} km` : "—"}</strong></div></div>
              </div>
            </article>

            <article className="widget nearby-widget">
              <header><div><h3>Les 5 prochains appareils</h3><p>Classement par distance à HOME</p></div></header>
              <ol>
                {closest.length ? closest.map((item, index) => (
                  <li key={item.id} className={item.id === selected?.id ? "active" : ""} onClick={() => setSelectedId(item.id)}>
                    <span>{index + 1}</span><strong>{item.route ? `${item.route.fromCode} → ${item.route.toCode}` : item.callsign}</strong><small>{item.operator} {item.type}</small><b>{item.distanceKm.toFixed(1)} km</b>
                  </li>
                )) : <li className="empty-row">Aucun appareil reçu.</li>}
              </ol>
            </article>

            <article className="widget altitude-widget">
              <header><div><h3>Altitudes des appareils</h3><p>Répartition par tranche d’altitude</p></div></header>
              <AltitudeBars aircraft={filteredAircraft} />
            </article>
          </section>
        </div>

        <DetailPanel selected={selected} module={module} />
      </section>

      <footer className="statusbar"><span>Données ADS-B actualisées automatiquement</span><span>Couverture : selon réception publique disponible</span><span className="refresh-dot">● Prochaine actualisation : 15 s</span><span>© XavPac V7</span></footer>
    </main>
  );
}
