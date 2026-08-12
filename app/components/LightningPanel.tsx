"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { XAVPAC_HOME } from "../config/home";
import { useLiveGeolocation } from "../hooks/useLiveGeolocation";
import {
  analyzeLightningTrend,
  lightningActivityLabel,
  lightningAgeBand,
  lightningAgeMinutes,
  lightningBearing,
  lightningCardinalDirection,
  lightningDistanceKm,
  summarizeLightning,
  type LightningFeed,
  type LightningStrike
} from "../lib/weather/lightning";
import type { MapPoint } from "./StableMap";
import LightningMapPanel from "./LightningMapPanel";

const StableMap = dynamic(() => import("./StableMap"), { ssr: false });

const FILTERS = [
  { label: "15 min", minutes: 15 },
  { label: "30 min", minutes: 30 },
  { label: "1 h", minutes: 60 },
  { label: "3 h", minutes: 180 },
  { label: "6 h", minutes: 360 },
  { label: "24 h", minutes: 1_440 },
  { label: "7 jours", minutes: 10_080 },
  { label: "30 jours", minutes: 43_200 },
  { label: "Année", minutes: 525_600 }
] as const;

const AGE_COLORS: Record<ReturnType<typeof lightningAgeBand>, string> = {
  "under-5": "#fff4b8",
  "5-15": "#f4cb63",
  "15-30": "#c996da",
  "30-60": "#7e76b8",
  older: "#59627a"
};

function formatAge(occurredAtUtc: string, nowMs: number) {
  const minutes = Math.floor(lightningAgeMinutes({ occurredAtUtc }, nowMs));
  if (minutes < 1) return "à l’instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return `il y a ${Math.floor(hours / 24)} j`;
}

function formatLocal(utc: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(utc));
}

function periodStart(minutes: number, nowMs: number) {
  if (minutes === 525_600) {
    const now = new Date(nowMs);
    return new Date(now.getFullYear(), 0, 1).toISOString();
  }
  return new Date(nowMs - Math.max(60, minutes) * 60_000).toISOString();
}

function closestImpacts(impacts: LightningStrike[]) {
  return impacts
    .map((impact) => ({ impact, distanceKm: lightningDistanceKm(XAVPAC_HOME.position, impact) }))
    .sort((first, second) => first.distanceKm - second.distanceKm)
    .slice(0, 5);
}

export default function LightningPanel() {
  const { position, isLive } = useLiveGeolocation();
  const [periodMinutes, setPeriodMinutes] = useState(60);
  const [feed, setFeed] = useState<LightningFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [observationRings, setObservationRings] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    async function loadLightning() {
      setLoading(true);
      const parameters = new URLSearchParams({
        lat: String(XAVPAC_HOME.position[0]),
        lon: String(XAVPAC_HOME.position[1]),
        radiusKm: "50",
        from: periodStart(periodMinutes, Date.now())
      });
      try {
        const response = await fetch(`/api/lightning?${parameters}`, { cache: "no-store", signal: controller.signal });
        const payload = await response.json() as LightningFeed;
        if (!cancelled) setFeed(payload);
      } catch {
        if (!cancelled) setFeed({
          status: "unavailable",
          source: null,
          retrievedAt: new Date().toISOString(),
          availableSince: null,
          impacts: [],
          message: "DONNÉES FOUDRE NON DISPONIBLES"
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadLightning();
    const refresh = window.setInterval(loadLightning, 60_000);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(refresh);
    };
  }, [periodMinutes]);

  const impacts = useMemo(() => feed?.status === "available"
    ? feed.impacts.filter((impact) => lightningAgeMinutes(impact, nowMs) <= periodMinutes)
    : [], [feed, nowMs, periodMinutes]);
  const summary = useMemo(() => summarizeLightning(impacts, XAVPAC_HOME.position, periodMinutes, nowMs), [impacts, nowMs, periodMinutes]);
  const summary10 = useMemo(() => summarizeLightning(impacts, XAVPAC_HOME.position, 10, nowMs), [impacts, nowMs]);
  const summary30 = useMemo(() => summarizeLightning(impacts, XAVPAC_HOME.position, 30, nowMs), [impacts, nowMs]);
  const summary60 = useMemo(() => summarizeLightning(impacts, XAVPAC_HOME.position, 60, nowMs), [impacts, nowMs]);
  const trend = useMemo(() => analyzeLightningTrend(impacts, XAVPAC_HOME.position, nowMs), [impacts, nowMs]);
  const nearest = useMemo(() => closestImpacts(impacts), [impacts]);
  const selected = impacts.find((impact) => impact.id === selectedId) ?? null;
  const dataAvailable = feed?.status === "available";

  const mapPoints = useMemo<MapPoint[]>(() => [
    {
      id: "lightning-home",
      lat: XAVPAC_HOME.position[0],
      lon: XAVPAC_HOME.position[1],
      name: "HOME",
      detail: XAVPAC_HOME.address,
      category: "home"
    },
    ...(position ? [{
      id: "lightning-moi",
      lat: position[0],
      lon: position[1],
      name: "MOI",
      detail: "Position GPS du Mac",
      category: "moi"
    }] : []),
    ...impacts.map((impact) => {
      const age = lightningAgeMinutes(impact, nowMs);
      const band = lightningAgeBand(age);
      const distance = lightningDistanceKm(XAVPAC_HOME.position, impact);
      const bearing = lightningBearing(XAVPAC_HOME.position, impact);
      return {
        id: impact.id,
        lat: impact.latitude,
        lon: impact.longitude,
        name: `Impact • ${distance < 1 ? `${Math.round(distance * 1_000)} m` : `${distance.toFixed(1)} km`}`,
        detail: `${lightningCardinalDirection(bearing)} • ${Math.round(bearing).toString().padStart(3, "0")}° • ${formatLocal(impact.occurredAtUtc)} • ${formatAge(impact.occurredAtUtc, nowMs)} • ${impact.source}`,
        category: `lightning-${band}`,
        color: AGE_COLORS[band]
      };
    })
  ], [impacts, nowMs, position]);

  const selectedFilter = FILTERS.find((filter) => filter.minutes === periodMinutes)?.label ?? "1 h";
  const activity = lightningActivityLabel(summary10.within10Km);

  return <div className="lightning-module">
    <section className={`lightning-now ${dataAvailable ? "available" : "unavailable"}`}>
      <div className="lightning-now-title">
        <span className="eyebrow">ORAGE AUTOUR DE HOME</span>
        <h1>{loading ? "Actualisation des impacts…" : dataAvailable ? activity : "DONNÉES FOUDRE NON DISPONIBLES"}</h1>
        <p>{dataAvailable
          ? summary.count
            ? `Activité principalement située ${summary.mainSector ? `au ${summary.mainSector}` : "dans plusieurs secteurs"} de HOME.`
            : `Aucune activité foudre détectée dans les données disponibles autour de HOME sur ${selectedFilter}.`
          : feed?.message ?? "Connexion à la source structurée en attente."}</p>
      </div>
      <div className="lightning-now-grid" aria-label="Résumé foudre actuel">
        <div><span>⚡ Impacts &lt;10 km / 1 h</span><strong>{dataAvailable ? summary60.within10Km : "—"}</strong></div>
        <div><span>📍 Plus proche</span><strong>{dataAvailable && summary.nearestKm !== null ? `${summary.nearestKm.toFixed(1)} km` : "—"}</strong></div>
        <div><span>🕐 Dernier</span><strong>{dataAvailable && summary.latestAt ? formatAge(summary.latestAt, nowMs) : "—"}</strong></div>
        <div><span>🧭 Secteur</span><strong>{dataAvailable ? summary.mainSector ?? "Indéterminé" : "—"}</strong></div>
        <div><span>↗ Tendance</span><strong>{dataAvailable ? trend.label : "Indéterminée"}</strong><small>{dataAvailable ? `Confiance ${trend.confidence}` : "Données insuffisantes"}</small></div>
      </div>
    </section>

    <section className="panel lightning-reference-card">
      <div><span className="eyebrow">RÉFÉRENCE FIXE</span><h2>HOME</h2><p>{XAVPAC_HOME.address}</p></div>
      <div className="lightning-reference-meta"><strong>{XAVPAC_HOME.position[0].toFixed(6)} / {XAVPAC_HOME.position[1].toFixed(6)}</strong><span>Géocodé par {XAVPAC_HOME.geocoding.source}</span>{isLive && <small>MOI est aussi affiché sur la carte, sans remplacer HOME.</small>}</div>
    </section>

    <LightningMapPanel position={XAVPAC_HOME.position} />

    {!dataAvailable && <div className="lightning-data-warning lightning-data-warning-primary">
      <strong>La carte des impacts en direct est disponible ci-dessus.</strong>
      <span>Les compteurs, distances et statistiques locales restent indisponibles tant qu’aucun flux structuré autorisé n’est configuré.</span>
    </div>}

    <nav className="lightning-time-filters" aria-label="Période des impacts">
      {FILTERS.map((filter) => <button type="button" key={filter.label} className={periodMinutes === filter.minutes ? "active" : ""} onClick={() => setPeriodMinutes(filter.minutes)}>{filter.label}</button>)}
    </nav>

    <section className="panel lightning-local-map-card">
      <header className="panel-title"><div><span className="eyebrow">CARTE LOCALE</span><h2>Distances autour de HOME</h2></div><button type="button" className={observationRings ? "active" : ""} onClick={() => setObservationRings((value) => !value)}>{observationRings ? "Masquer 20/50 km" : "Afficher 20/50 km"}</button></header>
      <div className="lightning-local-map">
        <StableMap
          points={mapPoints}
          center={XAVPAC_HOME.position}
          zoom={11}
          radiusKm={observationRings ? 50 : 10}
          distanceRingsKm={observationRings ? [2, 3, 5, 10, 20, 50] : [2, 3, 5, 10]}
          selectedId={selectedId}
          onSelect={setSelectedId}
          mapVariant="dark"
        />
      </div>
      <div className="lightning-age-legend"><span><i className="age-under-5" />&lt; 5 min</span><span><i className="age-5-15" />5–15 min</span><span><i className="age-15-30" />15–30 min</span><span><i className="age-30-60" />30–60 min</span><span><i className="age-older" />Plus ancien</span></div>
      {!dataAvailable && <div className="lightning-data-warning"><strong>Les cercles et HOME sont exacts.</strong><span>Les impacts ne peuvent pas être placés sur cette carte sans flux de données structuré autorisé.</span></div>}
      {selected && <article className="lightning-selected-impact"><span>⚡ IMPACT</span><strong>{lightningDistanceKm(XAVPAC_HOME.position, selected).toFixed(2)} km au {lightningCardinalDirection(lightningBearing(XAVPAC_HOME.position, selected))}</strong><p>Azimut {Math.round(lightningBearing(XAVPAC_HOME.position, selected)).toString().padStart(3, "0")}° • {formatLocal(selected.occurredAtUtc)} • {formatAge(selected.occurredAtUtc, nowMs)}</p><p>{selected.latitude.toFixed(6)} / {selected.longitude.toFixed(6)} • Source : {selected.source}</p>{selected.quality?.precisionMeters !== undefined && <p>Précision : ±{Math.round(selected.quality.precisionMeters)} m</p>}</article>}
    </section>

    <section className="lightning-period-grid">
      {[{ title: "10 dernières minutes", value: summary10 }, { title: "30 dernières minutes", value: summary30 }, { title: "1 heure", value: summary60 }].map(({ title, value }) => <article className="panel" key={title}><span className="eyebrow">{title}</span><strong>{dataAvailable ? `${value.count} impact${value.count === 1 ? "" : "s"}` : "—"}</strong><p>Distance minimale : {dataAvailable && value.nearestKm !== null ? `${value.nearestKm.toFixed(1)} km` : "non déterminée"}</p><p>Secteur : {dataAvailable ? value.mainSector ?? "indéterminé" : "indéterminé"}</p></article>)}
    </section>

    <section className="panel lightning-analysis-card">
      <div><span className="eyebrow">ÉVOLUTION</span><h2>{dataAvailable ? trend.label : "Tendance indéterminée"}</h2><p>{dataAvailable ? trend.reason : "Aucune trajectoire ni ETA ne peut être calculée sans impacts structurés."}</p></div>
      <div><span>Confiance</span><strong>{dataAvailable ? trend.confidence : "indéterminée"}</strong><small>Comparaison déterministe des fenêtres 30–20, 20–10 et 10–0 min.</small></div>
    </section>

    <section className="panel lightning-closest-card">
      <div className="panel-title"><div><span className="eyebrow">LES 5 IMPACTS LES PLUS PROCHES DE HOME</span><h2>{dataAvailable ? "Période sélectionnée" : "Historique en attente"}</h2></div></div>
      {nearest.length ? <div className="lightning-closest-list">{nearest.map(({ impact, distanceKm }, index) => {
        const bearing = lightningBearing(XAVPAC_HOME.position, impact);
        return <button type="button" key={impact.id} onClick={() => setSelectedId(impact.id)}><b>{index + 1}</b><strong>{distanceKm < 1 ? `${Math.round(distanceKm * 1_000)} m` : `${distanceKm.toFixed(2)} km`}</strong><span>{formatLocal(impact.occurredAtUtc)}</span><span>{lightningCardinalDirection(bearing)} • {Math.round(bearing).toString().padStart(3, "0")}°</span><small>Voir sur la carte</small></button>;
      })}</div> : <p className="lightning-empty">{dataAvailable ? "Aucun impact dans les données disponibles sur cette période." : "DONNÉES FOUDRE NON DISPONIBLES — aucun record n’est inventé."}</p>}
    </section>

    <section className="lightning-history-grid">
      <article className="panel"><span className="eyebrow">STATISTIQUES HOME</span><h3>Rayons cumulés</h3><div className="lightning-stats-table"><span>Période</span><b>&lt;2 km</b><b>&lt;3 km</b><b>&lt;5 km</b><b>&lt;10 km</b><span>{selectedFilter}</span><strong>{dataAvailable ? summary.within2Km : "—"}</strong><strong>{dataAvailable ? summary.within3Km : "—"}</strong><strong>{dataAvailable ? summary.within5Km : "—"}</strong><strong>{dataAvailable ? summary.within10Km : "—"}</strong></div></article>
      <article className="panel"><span className="eyebrow">HISTORIQUE ET RECORDS</span><h3>{feed?.availableSince ? `Disponible depuis le ${formatLocal(feed.availableSince)}` : "Collecte structurée non démarrée"}</h3><p>Les records, épisodes orageux et comparaisons Netatmo seront calculés uniquement à partir de la période réellement conservée.</p><strong className="lightning-no-invention">Aucun historique annuel fictif</strong></article>
      <article className="panel"><span className="eyebrow">DEPUIS VOTRE DERNIÈRE CONSULTATION</span><h3>{dataAvailable ? "Analyse prête" : "Comparaison indisponible"}</h3><p>{dataAvailable ? "La prochaine consultation pourra comparer les compteurs issus de cette même source." : "Une première acquisition valide est nécessaire avant toute comparaison."}</p></article>
    </section>
  </div>;
}
