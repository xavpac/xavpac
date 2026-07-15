"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useLiveGeolocation } from "../hooks/useLiveGeolocation";

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

type RtbaZone = {
  id: string;
  name: string;
  status: "unknown";
  floor: string;
  ceiling: string;
  positions: [number, number][];
};

const SAONE_ET_LOIRE_CENTER: [number, number] = [46.67, 4.67];
const SAONE_ET_LOIRE_BOUNDS: [[number, number], [number, number]] = [
  [45.82, 3.42],
  [47.48, 5.82]
];

// Contour simplifié destiné au cadrage départemental de la carte.
const SAONE_ET_LOIRE_CONTOUR: [number, number][] = [
  [46.12, 3.87], [46.39, 3.71], [46.70, 3.76], [46.96, 3.93],
  [47.17, 4.25], [47.15, 4.63], [47.09, 5.08], [46.91, 5.37],
  [46.65, 5.43], [46.42, 5.25], [46.18, 5.34], [45.98, 5.06],
  [46.02, 4.67], [45.94, 4.25], [46.12, 3.87]
];

// Les trois secteurs sont affichés en permanence pour le repérage visuel.
// Leur activation et leurs limites réglementaires doivent être confirmées sur le SIA/AZBA.
const rtbaZones: RtbaZone[] = [
  { id: "r142-b", name: "R 142 B", status: "unknown", floor: "Voir publication SIA", ceiling: "Voir publication SIA", positions: [[46.44,3.55],[46.57,3.72],[46.51,4.00],[46.34,3.91]] },
  { id: "r142-a", name: "R 142 A", status: "unknown", floor: "Voir publication SIA", ceiling: "Voir publication SIA", positions: [[46.36,3.85],[46.55,3.96],[46.50,4.27],[46.30,4.16]] },
  { id: "r144-b", name: "R 144 B", status: "unknown", floor: "Voir publication SIA", ceiling: "Voir publication SIA", positions: [[46.08,3.89],[46.38,4.02],[46.31,4.28],[46.02,4.18]] },
  { id: "r45-s3", name: "R 45 S3", status: "unknown", floor: "Voir publication SIA", ceiling: "Voir publication SIA", positions: [[46.45,4.08],[46.67,4.18],[46.59,4.56],[46.33,4.40]] },
  { id: "r45-b", name: "R 45 B", status: "unknown", floor: "Voir publication SIA", ceiling: "Voir publication SIA", positions: [[46.48,4.39],[46.73,4.48],[46.82,4.76],[46.55,4.82],[46.38,4.62]] },
  { id: "r45-s2", name: "R 45 S2", status: "unknown", floor: "Voir publication SIA", ceiling: "Voir publication SIA", positions: [[46.73,4.20],[46.94,4.32],[47.03,4.72],[46.84,4.82],[46.67,4.54]] },
  { id: "r45-s5", name: "R 45 S5", status: "unknown", floor: "Voir publication SIA", ceiling: "Voir publication SIA", positions: [[45.98,4.35],[46.31,4.50],[46.42,4.82],[46.19,4.97],[45.94,4.73]] },
  { id: "r45-s62", name: "R 45 S6.2", status: "unknown", floor: "Voir publication SIA", ceiling: "Voir publication SIA", positions: [[46.13,4.82],[46.42,4.91],[46.51,5.27],[46.31,5.43],[46.06,5.20]] },
  { id: "r45-s61", name: "R 45 S6.1", status: "unknown", floor: "Voir publication SIA", ceiling: "Voir publication SIA", positions: [[46.43,5.04],[46.69,5.14],[46.84,5.40],[46.65,5.58],[46.39,5.37]] },
  { id: "r45-s7", name: "R 45 S7", status: "unknown", floor: "Voir publication SIA", ceiling: "Voir publication SIA", positions: [[46.72,5.02],[46.93,5.13],[47.05,5.45],[46.87,5.62],[46.66,5.40]] },
  { id: "r45-a", name: "R 45 A", status: "unknown", floor: "Voir publication SIA", ceiling: "Voir publication SIA", positions: [[46.92,4.79],[47.12,4.92],[47.23,5.26],[47.04,5.42],[46.84,5.16]] },
  { id: "r45-s4", name: "R 45 S4", status: "unknown", floor: "Voir publication SIA", ceiling: "Voir publication SIA", positions: [[47.00,4.45],[47.19,4.55],[47.29,4.92],[47.10,5.03],[46.92,4.76]] },
  { id: "r45-ns", name: "R 45 N/S", status: "unknown", floor: "Voir publication SIA", ceiling: "Voir publication SIA", positions: [[47.16,4.87],[47.35,4.99],[47.43,5.24],[47.25,5.35],[47.10,5.12]] },
  { id: "r45-s1", name: "R 45 S1", status: "unknown", floor: "Voir publication SIA", ceiling: "Voir publication SIA", positions: [[47.14,5.12],[47.34,5.23],[47.40,5.50],[47.22,5.60],[47.06,5.34]] }
];

function pointInPolygon(point: [number, number], polygon: [number, number][]) {
  const [latitude, longitude] = point;
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const [currentLat, currentLon] = polygon[current];
    const [previousLat, previousLon] = polygon[previous];
    const intersects =
      currentLon > longitude !== previousLon > longitude &&
      latitude < ((previousLat - currentLat) * (longitude - currentLon)) / (previousLon - currentLon) + currentLat;
    if (intersects) inside = !inside;
  }
  return inside;
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
  const [mapMode, setMapMode] = useState<"official" | "department">("department");
  const { position, status: positionStatus, isLive, error: gpsError } = useLiveGeolocation();
  const [metar, setMetar] = useState<MetarReport | null>(null);
  const [metarStatus, setMetarStatus] = useState("Chargement du METAR…");

  useEffect(() => {
    let cancelled = false;
    async function loadMetar() {
      try {
        const response = await fetch("/api/airport-weather?ids=LFLM", { cache: "no-store" });
        const payload = await response.json();
        const report = Array.isArray(payload.metar) ? payload.metar[0] : null;
        if (!cancelled) {
          setMetar(report);
          setMetarStatus(response.ok && report ? "Observation LFLM reçue" : "METAR indisponible");
        }
      } catch {
        if (!cancelled) {
          setMetar(null);
          setMetarStatus("METAR indisponible");
        }
      }
    }
    loadMetar();
    const timer = window.setInterval(loadMetar, 10 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const insideDepartment = useMemo(
    () => pointInPolygon(position, SAONE_ET_LOIRE_CONTOUR),
    [position]
  );

  const containingZones = useMemo(
    () => rtbaZones.filter((zone) => pointInPolygon(position, zone.positions)),
    [position]
  );

  const message = !insideDepartment
    ? "Votre position GPS est hors Saône-et-Loire. La carte reste volontairement limitée au département 71."
    : containingZones.length
      ? `Votre position recoupe ${containingZones.map((zone) => zone.name).join(" et ")}. Vérifiez impérativement l’activation sur l’AZBA officiel.`
      : "Votre position ne recoupe aucun des secteurs RTBA représentés. Vérifiez malgré tout l’AZBA officiel avant le vol.";

  const zonesForMap = [
    {
      id: "saone-et-loire",
      name: "Saône-et-Loire (71)",
      status: "boundary" as const,
      floor: "Limite départementale simplifiée",
      ceiling: "—",
      positions: SAONE_ET_LOIRE_CONTOUR
    },
    ...rtbaZones
  ];

  const mapPoints = insideDepartment
    ? [{
        id: "home",
        lat: position[0],
        lon: position[1],
        name: "Votre position",
        detail: positionStatus,
        category: "home"
      }]
    : [];

  return (
    <>
      <section className="hero drone-hero-v4">
        <div>
          <span className="eyebrow">DRONE SDIS 71</span>
          <h1>Saône-et-Loire uniquement</h1>
          <p>Carte départementale fixe, toutes les zones RTBA affichées et position GPS suivie en continu.</p>
        </div>
        <div className={insideDepartment && !containingZones.length ? "hero-status ok" : "hero-status warning"}>
          <span>{insideDepartment && !containingZones.length ? "🟢" : "⚠️"}</span>
          <div><strong>{message}</strong><small>{positionStatus}</small></div>
        </div>
      </section>

      {gpsError && <div className="gps-banner-v5">📍 {gpsError}</div>}

      <section className="drone-console-v4">
        <article className="panel drone-map-card-v4">
          <div className="panel-title rtba-panel-title-v51">
            <div>
              <span className="eyebrow">ESPACE AÉRIEN 71</span>
              <h3>RTBA — carte opérationnelle</h3>
              <p className="muted">Le mode officiel affiche les couleurs d’activation publiées par le SIA. Le mode 71 reste cadré sur la Saône-et-Loire.</p>
            </div>
            <div className="rtba-mode-switch">
              <button type="button" className={mapMode === "official" ? "active" : ""} onClick={() => setMapMode("official")}>AZBA officiel live</button>
              <button type="button" className={mapMode === "department" ? "active" : ""} onClick={() => setMapMode("department")}>Vue Saône-et-Loire</button>
            </div>
          </div>

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
                  zones={zonesForMap}
                  center={SAONE_ET_LOIRE_CENTER}
                  zoom={8}
                  fixedBounds={SAONE_ET_LOIRE_BOUNDS}
                  maxBounds={SAONE_ET_LOIRE_BOUNDS}
                  lockBounds
                  showZoneLabels
                  mapVariant="layers"
                />
              </div>
              <div className="rtba-legend-v4">
                <span className="department">━━ Limite du département 71</span>
                <span className="unknown">┅┅ Repérage schématique — statut non inventé</span>
                <span>Pour les limites et couleurs exactes en direct : mode AZBA officiel live.</span>
              </div>
            </>
          )}

          <div className="rtba-zone-list-v5">
            {rtbaZones.map((zone) => (
              <article key={zone.id}>
                <span>🛩️</span>
                <div><strong>{zone.name}</strong><small>Visible • statut à vérifier sur le SIA</small></div>
              </article>
            ))}
          </div>
        </article>

        <aside className="drone-side-v4">
          <article className="panel rtba-check-card">
            <span className="eyebrow">GÉOLOCALISATION CONTINUE</span>
            <div className="check-row"><span>{isLive ? "🟢" : "🟠"}</span><div><strong>GPS</strong><small>{positionStatus}</small></div></div>
            <div className="check-row"><span>📍</span><div><strong>Coordonnées</strong><small>{position[0].toFixed(5)} / {position[1].toFixed(5)}</small></div></div>
            <div className="check-row"><span>🗺️</span><div><strong>Département</strong><small>{insideDepartment ? "Position dans le 71" : "Position hors du 71"}</small></div></div>
            <div className="check-row"><span>🛩️</span><div><strong>RTBA</strong><small>{containingZones.length ? `${containingZones.length} secteur(s) recoupé(s)` : "Aucun secteur représenté à la position"}</small></div></div>
            <p className="safety-note">La carte est une aide de repérage. L’AZBA, les NOTAM, SUP AIP et AIP officiels restent prioritaires.</p>
          </article>

          <article className="panel metar-card-v4">
            <div className="panel-title">
              <div>
                <span className="eyebrow">MÉTÉO AÉRONAUTIQUE</span>
                <h3>METAR traduit en français</h3>
                <p className="muted">Uniquement dans l’onglet Drone • LFLM Mâcon-Charnay</p>
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
                <details className="raw-report-v4"><summary>Voir le METAR brut</summary><code>{metar.rawOb ?? "—"}</code></details>
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
