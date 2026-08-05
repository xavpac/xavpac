"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { readObservations, type SpottingObservation } from "../lib/aviation/observations";

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

  useEffect(() => setObservations(readObservations()), []);

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
