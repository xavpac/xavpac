"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

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

// Géométries de repérage visuel intégrées à la maquette.
// Elles ne remplacent jamais les cartes et horaires officiels SIA/AZBA.
const rtbaZones: RtbaZone[] = [
  {
    id: "rtba-ouest-71",
    name: "Secteur RTBA Ouest 71",
    status: "unknown",
    floor: "À confirmer",
    ceiling: "À confirmer",
    positions: [[46.18, 3.92], [46.68, 3.88], [46.88, 4.48], [46.42, 4.72], [46.08, 4.36]]
  },
  {
    id: "rtba-est-71",
    name: "Secteur RTBA Est 71",
    status: "unknown",
    floor: "À confirmer",
    ceiling: "À confirmer",
    positions: [[46.45, 4.42], [47.03, 4.5], [47.16, 5.18], [46.7, 5.42], [46.38, 4.92]]
  }
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
  const [position, setPosition] = useState<[number, number]>([46.64, 4.5]);
  const [positionStatus, setPositionStatus] = useState("Position de référence");
  const [metar, setMetar] = useState<MetarReport | null>(null);
  const [metarStatus, setMetarStatus] = useState("Chargement du METAR…");

  useEffect(() => {
    if (!navigator.geolocation) {
      setPositionStatus("Géolocalisation indisponible");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (result) => {
        setPosition([result.coords.latitude, result.coords.longitude]);
        setPositionStatus(`GPS • précision ±${Math.round(result.coords.accuracy)} m`);
      },
      () => setPositionStatus("Position de référence utilisée"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

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

  const containingZones = useMemo(
    () => rtbaZones.filter((zone) => pointInPolygon(position, zone.positions)),
    [position]
  );

  const message = containingZones.length
    ? `Votre position se trouve dans ${containingZones.map((zone) => zone.name).join(" et ")}. Activité à vérifier sur l’AZBA officiel.`
    : "Votre position n’est dans aucun secteur RTBA représenté sur cette carte de repérage.";

  return (
    <>
      <section className="hero drone-hero-v4">
        <div>
          <span className="eyebrow">DRONE SDIS 71</span>
          <h1>Préparation rapide du vol</h1>
          <p>RTBA visible en permanence, position GPS et météo aéronautique expliquée en français.</p>
        </div>
        <div className={containingZones.length ? "hero-status warning" : "hero-status ok"}>
          <span>{containingZones.length ? "⚠️" : "🟢"}</span>
          <div><strong>{message}</strong><small>{positionStatus}</small></div>
        </div>
      </section>

      <section className="drone-console-v4">
        <article className="panel drone-map-card-v4">
          <div className="panel-title">
            <div>
              <span className="eyebrow">ESPACE AÉRIEN</span>
              <h3>Cartographie RTBA</h3>
              <p className="muted">Les secteurs restent dessinés, même lorsqu’aucune activité n’est connue.</p>
            </div>
            <a className="official-button" href="https://www.sia.aviation-civile.gouv.fr/schedules" target="_blank" rel="noreferrer">
              Ouvrir l’AZBA officiel ↗
            </a>
          </div>
          <div className="drone-map-v4">
            <StableMap
              points={[{
                id: "home",
                lat: position[0],
                lon: position[1],
                name: "Votre position",
                detail: positionStatus,
                category: "home"
              }]}
              zones={rtbaZones}
              center={position}
              zoom={8}
            />
          </div>
          <div className="rtba-legend-v4">
            <span className="unknown">● Zone dessinée — activité à vérifier</span>
            <span>Les NOTAM ne sont pas affichés sur la carte.</span>
          </div>
        </article>

        <aside className="drone-side-v4">
          <article className="panel metar-card-v4">
            <div className="panel-title">
              <div>
                <span className="eyebrow">MÉTÉO AÉRONAUTIQUE</span>
                <h3>METAR traduit en français</h3>
                <p className="muted">LFLM — Mâcon-Charnay</p>
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

          <article className="panel rtba-check-card">
            <span className="eyebrow">CONTRÔLE AVANT VOL</span>
            <div className="check-row"><span>📍</span><div><strong>Position</strong><small>{positionStatus}</small></div></div>
            <div className="check-row"><span>🛩️</span><div><strong>RTBA</strong><small>{containingZones.length ? "Secteur repéré — activité à vérifier" : "Aucun secteur repéré"}</small></div></div>
            <div className="check-row"><span>🌦️</span><div><strong>Météo</strong><small>{metarStatus}</small></div></div>
            <p className="safety-note">XavPac aide à préparer la décision. Les publications aéronautiques officielles restent prioritaires.</p>
          </article>
        </aside>
      </section>
    </>
  );
}
