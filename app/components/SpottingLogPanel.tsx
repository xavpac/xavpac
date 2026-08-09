"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { readObservations, type SpottingObservation } from "../lib/aviation/observations";
import { distanceKm } from "../lib/aviation/geometry";
import { getBrowserStorage, isCoordinatePair, parseStoredJson, safeGetItem, XAVPAC_STORAGE_KEYS } from "../lib/safeStorage";

const SAVED_HOME_KEY = XAVPAC_STORAGE_KEYS.savedHome;

const confidenceLabel = {
  confirmed: "🟢 Confirmée",
  probable: "🟡 Probable",
  inferred: "🔵 Déduite",
  unavailable: "⚪ Inconnue"
} as const;

function airportName(airport: SpottingObservation["departureAirport"]) {
  return airport?.municipality ?? airport?.iata ?? airport?.icao ?? "Inconnue";
}

function localDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function observationLabels(item: SpottingObservation) {
  if (item.remarkableLabels?.length) return item.remarkableLabels;
  const identity = [item.callsign, item.operator, item.aircraftType, item.registration].filter(Boolean).join(" ");
  if (/canadair|cl[- ]?415|cl[- ]?215/i.test(identity)) return ["Canadair"];
  if (/dash|q400|dhc[- ]?8/i.test(identity) && /sécurité civile|civil security|fire/i.test(identity)) return ["Dash Sécurité civile"];
  if (/at[- ]?802|fire ?boss|titan firefighting|tract[a-z]/i.test(identity)) return ["Avion de lutte contre les feux"];
  if (/dragon|sécurité civile|civil security/i.test(identity)) return ["Sécurité civile"];
  if (/samu|hems|medical/i.test(identity)) return ["SAMU"];
  if (/gendarmerie|douanes|armée|air force|marine nationale|awacs|a400m|mrtt/i.test(identity)) return ["Service public ou militaire"];
  return [];
}

export default function SpottingLogPanel() {
  const [observations, setObservations] = useState<SpottingObservation[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "remarkable" | "fire">("all");
  const [home, setHome] = useState<[number, number] | null>(null);
  const [homeRadius, setHomeRadius] = useState(5);

  useEffect(() => {
    setObservations(readObservations());
    const parsed = parseStoredJson(safeGetItem(getBrowserStorage("local"), SAVED_HOME_KEY));
    setHome(isCoordinatePair(parsed) ? parsed : null);
  }, []);

  const filtered = useMemo(() => observations.filter((item) => {
    const labels = observationLabels(item);
    if (filter === "remarkable" && !labels.length) return false;
    if (filter === "fire" && !labels.some((label) => /canadair|dash|feu|fire|bombardier/i.test(label))) return false;
    const haystack = [item.callsign, item.registration, item.operator, item.aircraftType, ...labels].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  }), [filter, observations, query]);

  const stats = useMemo(() => ({
    total: observations.length,
    aircraft: new Set(observations.map((item) => item.modeS)).size,
    routed: observations.filter((item) => item.departureAirport && item.arrivalAirport).length,
    remarkable: observations.filter((item) => observationLabels(item).length).length
  }), [observations]);

  const passageCounts = useMemo(() => {
    const all = new Map<string, number>();
    const home = new Map<string, number>();
    for (const item of observations) {
      all.set(item.modeS, (all.get(item.modeS) ?? 0) + 1);
      if (item.observationSite === "home") home.set(item.modeS, (home.get(item.modeS) ?? 0) + 1);
    }
    return { all, home };
  }, [observations]);

  const homeTraffic = useMemo(() => {
    const periods = [
      { key: "day", label: "24 heures", duration: 24 * 60 * 60 * 1000 },
      { key: "week", label: "7 jours", duration: 7 * 24 * 60 * 60 * 1000 },
      { key: "month", label: "30 jours", duration: 30 * 24 * 60 * 60 * 1000 },
      { key: "year", label: "365 jours", duration: 365 * 24 * 60 * 60 * 1000 }
    ];
    if (!home) return periods.map((period) => ({ ...period, count: 0, perKm: 0 }));
    const now = Date.now();
    const nearby = observations.filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude) && distanceKm(home, [item.latitude, item.longitude]) <= homeRadius);
    return periods.map((period) => {
      const count = nearby.filter((item) => now - Date.parse(item.observedAt) <= period.duration).length;
      return { ...period, count, perKm: count / homeRadius };
    });
  }, [home, homeRadius, observations]);

  return <section className="spotting-log">
    <header className="spotting-log-hero panel">
      <div><span>MON CARNET</span><h2>Les avions que j’ai croisés ✈️</h2><p>Enregistré uniquement sur cet appareil. Aucune donnée personnelle n’est envoyée ailleurs.</p></div>
      <div className="spotting-log-stats">
        <article><strong>{stats.aircraft}</strong><span>appareils uniques</span></article>
        <article><strong>{stats.total}</strong><span>passages</span></article>
        <article><strong>{stats.routed}</strong><span>routes connues</span></article>
        <article><strong>{stats.remarkable}</strong><span>remarquables</span></article>
      </div>
    </header>

    <section className="home-traffic panel">
      <header><div><span>🏠 TRAFIC AU-DESSUS DE HOME</span><h3>Combien d’avions passent près de chez moi ?</h3></div><label>Rayon analysé <select value={homeRadius} onChange={(event) => setHomeRadius(Number(event.target.value))}>{[1, 2, 5, 10, 20, 50].map((radius) => <option key={radius} value={radius}>{radius} km</option>)}</select></label></header>
      {!home ? <p className="home-traffic-missing">Enregistrez d’abord votre position avec le bouton « Enregistrer ce HOME » dans l’onglet Trafic.</p> : <>
        <div className="home-traffic-periods">{homeTraffic.map((period) => <article key={period.key}><small>Derniers {period.label}</small><strong>{period.count}</strong><span>passage{period.count > 1 ? "s" : ""}</span><em>{period.perKm.toFixed(1)} passage{period.perKm >= 2 ? "s" : ""} / km</em></article>)}</div>
        <p>Calcul effectué localement dans un rayon de {homeRadius} km autour de HOME. Une observation correspond à un appareil identifié pendant une tranche horaire ; ce n’est pas un comptage radar certifié.</p>
      </>}
    </section>

    <div className="spotting-log-toolbar panel">
      <input aria-label="Rechercher dans le carnet" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un avion, une immatriculation…" />
      <div>
        <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Tous</button>
        <button className={filter === "remarkable" ? "active" : ""} onClick={() => setFilter("remarkable")}>⭐ Remarquables</button>
        <button className={filter === "fire" ? "active" : ""} onClick={() => setFilter("fire")}>🔥 Lutte feux</button>
      </div>
    </div>

    {!filtered.length ? <div className="spotting-log-empty panel"><b>🔭</b><h3>Aucune observation dans cette sélection</h3><p>Laissez l’onglet Trafic ouvert : les appareils identifiés rejoindront automatiquement ce carnet.</p></div> :
      <div className="spotting-log-grid">{filtered.slice(0, 200).map((item) => <article className="spotting-card panel" key={item.id}>
        <div className="spotting-card-photo">{item.photoUrl ? <Image src={item.photoUrl} alt="" fill sizes="124px" unoptimized /> : <span>✈️</span>}<b>{observationLabels(item)[0] ?? item.aircraftType ?? "Appareil"}</b></div>
        <div className="spotting-card-body">
          <small>{localDate(item.observedAt)}</small>
          <h3>{item.callsign ?? item.registration ?? item.modeS}</h3>
          <p>{item.operator ?? "Opérateur non identifié"} • {item.registration ?? "Immatriculation inconnue"}</p>
          <div className="spotting-seen-count"><strong>👀 {passageCounts.all.get(item.modeS) ?? 1} passage{(passageCounts.all.get(item.modeS) ?? 1) > 1 ? "s" : ""}</strong>{(passageCounts.home.get(item.modeS) ?? 0) > 0 && <span>🏠 {passageCounts.home.get(item.modeS)} à HOME</span>}</div>
          <div className="spotting-route"><strong>{airportName(item.departureAirport)}</strong><span>→</span><strong>{airportName(item.arrivalAirport)}</strong></div>
          <div className="spotting-card-meta"><span>{confidenceLabel[item.routeConfidence]}</span><span>{item.distanceKm === null ? "Distance inconnue" : `${item.distanceKm.toFixed(1)} km au plus près`}</span><span>{item.altitudeMeters === null ? "Altitude inconnue" : `${Math.round(item.altitudeMeters)} m`}</span></div>
          <footer>Source : {item.routeSource ?? item.positionSource ?? "Observation XavPac"}</footer>
        </div>
      </article>)}</div>}
  </section>;
}
