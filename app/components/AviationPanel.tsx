"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveGeolocation } from "../hooks/useLiveGeolocation";
import { reportDataUpdate } from "../lib/buildInfo";
import type { EnrichedAircraft, RouteConfidence } from "../lib/aviation/types";
import { deducedRoute, recordObservations } from "../lib/aviation/observations";
import { detectRemarkable } from "../lib/aviation/remarkable";
import {
  aircraftPositionTimestamp,
  analyzeAircraftPassage,
  PassageHistoryStore,
  type PassageAnalysis
} from "../lib/aviation/passageTracker";

const StableMap = dynamic(() => import("./StableMap"), { ssr: false });
const OPERATIONAL_MAP_CENTER: [number, number] = [46.63, 4.56];

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
  positionSource?: string;
  lastPositionAt?: string | null;
  positionAgeSeconds?: number | null;
};

type AircraftWithDistance = LiveAircraft & { distance: number };
type Radius = 20 | 50 | 100;
type MapStyle = "street" | "satellite" | "dark";

type RouteAirport = { name?: string; municipality?: string; iata_code?: string; icao_code?: string };
type RouteWeather = { time?: string; temperature_2m?: number; weather_code?: number; wind_speed_10m?: number; wind_gusts_10m?: number; visibility?: number; surface_pressure?: number; cloud_cover?: number };
type FlightRoute = { origin: RouteAirport; destination: RouteAirport; originWeather: RouteWeather | null; destinationWeather: RouteWeather | null };
type AviationNews = { date: string; title: string; summary: string; location: string; source: string; link: string };

const confidenceLabels: Record<RouteConfidence, string> = { confirmed: "Confirmée", probable: "Probable", inferred: "Déduite", unavailable: "Non disponible" };

function weatherCondition(code?: number) {
  if (code === undefined) return "Conditions non déterminées";
  if (code === 0) return "Ciel dégagé";
  if ([1, 2].includes(code)) return "Éclaircies";
  if (code === 3) return "Couvert";
  if ([45, 48].includes(code)) return "Brouillard";
  if ([51, 53, 55, 56, 57].includes(code)) return "Bruine";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Pluie ou averses";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Neige";
  if ([95, 96, 99].includes(code)) return "Orage";
  return "Conditions variables";
}

function distanceKm(origin: [number, number], destination: [number, number]) {
  const [lat1, lon1] = origin.map((value) => (value * Math.PI) / 180);
  const [lat2, lon2] = destination.map((value) => (value * Math.PI) / 180);
  const deltaLat = lat2 - lat1;
  const deltaLon = lon2 - lon1;
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatAltitude(value: number | null) {
  return value === null ? "—" : `${Math.round(value).toLocaleString("fr-FR")} m`;
}

function formatFlightLevel(value: number | null) {
  if (value === null) return "—";
  return `FL${Math.max(0, Math.round(value / 30.48)).toString().padStart(3, "0")}`;
}

function formatSpeedKmh(value: number | null) {
  return value === null ? "—" : `${Math.round(value * 3.6)} km/h`;
}

function formatSpeedKnots(value: number | null) {
  return value === null ? "—" : `${Math.round(value * 1.94384)} kt`;
}

function formatVertical(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  const feetPerMinute = value * 196.8504;
  return `${feetPerMinute >= 0 ? "+" : ""}${Math.round(feetPerMinute)} ft/min`;
}

function directionName(track: number | null) {
  if (track === null) return "—";
  const directions = ["Nord", "Nord-Est", "Est", "Sud-Est", "Sud", "Sud-Ouest", "Ouest", "Nord-Ouest"];
  return `${directions[Math.round(track / 45) % 8]} • ${Math.round(track)}°`;
}

function bearingName(origin: [number, number], destination: [number, number]) {
  const lat1 = (origin[0] * Math.PI) / 180;
  const lat2 = (destination[0] * Math.PI) / 180;
  const dLon = ((destination[1] - origin[1]) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  const normalized = (bearing + 360) % 360;
  const directions = ["Nord", "Nord-Est", "Est", "Sud-Est", "Sud", "Sud-Ouest", "Ouest", "Nord-Ouest"];
  return { label: directions[Math.round(normalized / 45) % 8], bearing: normalized };
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const rounded = Math.round(seconds);
  if (rounded < 60) return `${rounded} s`;
  const minutes = Math.floor(rounded / 60);
  const remaining = rounded % 60;
  if (minutes < 60) return `${minutes} min ${remaining.toString().padStart(2, "0")} s`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function passageTitle(analysis: PassageAnalysis | null) {
  if (!analysis || analysis.status === "no-observer") return "Position GPS réelle requise";
  if (analysis.status === "stale") return "Position aéronef trop ancienne pour estimer le passage";
  if (analysis.status === "waiting") return "Analyse du rapprochement en attente de nouvelles positions";
  if (analysis.status === "approaching") return analysis.estimatedSecondsToClosest === null
    ? "En rapprochement"
    : `En rapprochement — passage au plus près estimé dans ${formatDuration(analysis.estimatedSecondsToClosest)}`;
  if (analysis.status === "closest") return "Passage au plus près";
  if (analysis.status === "receding") return analysis.secondsSinceClosest === null
    ? "En éloignement"
    : `En éloignement depuis environ ${formatDuration(analysis.secondsSinceClosest)}`;
  if (analysis.status === "non-convergent") return "Trajectoire non convergente";
  return "Impossible à analyser avec les données disponibles";
}

function passageDetail(analysis: PassageAnalysis | null) {
  if (!analysis) return "Le calcul utilise uniquement votre position GPS réelle.";
  if (analysis.status === "non-convergent") return "L’appareil ne devrait pas passer à proximité immédiate de votre position.";
  if (analysis.status === "insufficient") return "Distance stable ou données de trajectoire insuffisantes.";
  if (analysis.status === "approaching" && analysis.estimatedSecondsToClosest === null) return "Rapprochement mesuré ; estimation temporelle indisponible sans cap et vitesse complets.";
  if (analysis.status === "receding") return "La distance augmente après le minimum observé.";
  if (analysis.status === "closest") return "Minimum observé et projection de trajectoire concordants.";
  return "Calcul recalculé à chaque nouvelle position ADS-B.";
}

function formatFreshness(seconds: number | null) {
  if (seconds === null) return "Inconnue";
  return seconds < 1 ? "À l’instant" : `${Math.round(seconds)} s`;
}

function formatDistanceEvolution(analysis: PassageAnalysis | null) {
  if (!analysis || analysis.distanceDeltaKm === null) return "En attente";
  if (Math.abs(analysis.distanceDeltaKm) < 0.02) return "Quasi stable";
  const sign = analysis.distanceDeltaKm > 0 ? "+" : "−";
  return `${sign}${Math.abs(analysis.distanceDeltaKm).toFixed(2)} km`;
}

function formatRelativeSpeed(analysis: PassageAnalysis | null) {
  if (!analysis || analysis.closingSpeedMetersPerSecond === null) return "Non déterminée";
  const speed = Math.abs(analysis.closingSpeedMetersPerSecond);
  if (speed < 1.5) return "Quasi stable";
  return analysis.closingSpeedMetersPerSecond > 0
    ? `${Math.round(speed)} m/s vers vous`
    : `${Math.round(speed)} m/s en éloignement`;
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
  if (text.includes("heli") || text.includes("rotor")) return { category: "helicopter", color: "#4fa8ff" };
  if (/(military|armée|air force|fighter|rafale|mirage|trainer)/i.test(text)) return { category: "military", color: "#ff5e78" };
  if (/(cessna|piper|robin|cirrus|ultralight|ulm|glider|bristell)/i.test(text)) return { category: "light", color: "#bc83ff" };
  return { category: "commercial", color: "#ffb000" };
}

function altitudeBand(value: number | null) {
  if (value === null) return 0;
  const fl = value / 30.48;
  if (fl >= 400) return 4;
  if (fl >= 300) return 3;
  if (fl >= 200) return 2;
  if (fl >= 100) return 1;
  return 0;
}

function weatherVisibility(value: number | null) {
  if (value === null) return "—";
  return value >= 10000 ? "> 10 km" : `${(value / 1000).toFixed(1)} km`;
}

export default function AviationPanel() {
  const { position, status: positionStatus, accuracy, timestamp: gpsTimestamp, isLive, error: gpsError } = useLiveGeolocation();
  const [radius, setRadius] = useState<Radius>(50);
  const [aircraft, setAircraft] = useState<AircraftWithDistance[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [manualSelection, setManualSelection] = useState(false);
  const [sourceStatus, setSourceStatus] = useState("Connexion Airplanes.live…");
  const [error, setError] = useState("");
  const [enrichedByModeS, setEnrichedByModeS] = useState<Record<string, EnrichedAircraft>>({});
  const [enrichmentStatus, setEnrichmentStatus] = useState("Enrichissement en attente");
  const [mapStyle, setMapStyle] = useState<MapStyle>("street");
  const [showTrails, setShowTrails] = useState(true);
  const [showCircle, setShowCircle] = useState(true);
  const [locateSignal, setLocateSignal] = useState(0);
  const [news, setNews] = useState<AviationNews[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [flightOnly, setFlightOnly] = useState(true);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const trailsRef = useRef<Record<string, [number, number][]>>({});
  const [trailsVersion, setTrailsVersion] = useState(0);
  const passageHistoryRef = useRef(new PassageHistoryStore());
  const [passageHistoryVersion, setPassageHistoryVersion] = useState(0);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("xavpac-favorites");
      if (stored) setFavoriteIds(JSON.parse(stored));
    } catch {
      setFavoriteIds([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        setError("");
        const center = position ?? OPERATIONAL_MAP_CENTER;
        const response = await fetch(`/api/aircraft?lat=${center[0]}&lon=${center[1]}&radius=${radius}`, { cache: "no-store" });
        const payload = await response.json();
        if (cancelled) return;

        const sorted: AircraftWithDistance[] = (Array.isArray(payload.aircraft) ? payload.aircraft : [])
          .map((item: LiveAircraft) => ({ ...item, distance: distanceKm(center, [item.latitude, item.longitude]) }))
          .filter((item: AircraftWithDistance) => item.distance <= radius + 1)
          .sort((a: AircraftWithDistance, b: AircraftWithDistance) => a.distance - b.distance);

        setAircraft(sorted);
        reportDataUpdate("aviation");

        if (sorted.length === 0) {
          setSelectedId(null);
          setManualSelection(false);
        } else if (!manualSelection || !sorted.some((item) => item.id === selectedId)) {
          setSelectedId(sorted[0].id);
          setManualSelection(false);
        }

        for (const item of sorted.slice(0, 80)) {
          const current = trailsRef.current[item.id] ?? [];
          const nextPoint: [number, number] = [item.latitude, item.longitude];
          const previousPoint = current[current.length - 1];
          const isNew = !previousPoint || Math.abs(previousPoint[0] - nextPoint[0]) > 0.00005 || Math.abs(previousPoint[1] - nextPoint[1]) > 0.00005;
          trailsRef.current[item.id] = isNew ? [...current, nextPoint].slice(-50) : current;
        }
        setTrailsVersion((value) => value + 1);

        if (position) {
          let historyChanged = false;
          for (const item of sorted.slice(0, 100)) {
            historyChanged = passageHistoryRef.current.record({
              modeS: item.id,
              latitude: item.latitude,
              longitude: item.longitude,
              altitudeMeters: item.barometricAltitude,
              groundSpeedMetersPerSecond: item.velocity,
              trackDegrees: item.trueTrack,
              positionTimestampMs: aircraftPositionTimestamp(item.lastPositionAt),
              observer: position,
              observerTimestampMs: gpsTimestamp
            }) || historyChanged;
          }
          if (historyChanged) setPassageHistoryVersion((value) => value + 1);
        }

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
    const timer = window.setInterval(refresh, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [position, radius, manualSelection, selectedId, gpsTimestamp]);

  useEffect(() => {
    fetch("/api/aviation-news", { cache: "no-store" }).then((response) => response.json()).then((payload) => setNews(Array.isArray(payload.news) ? payload.news : [])).catch(() => setNews([]));
  }, []);

  const selected = useMemo(() => aircraft.find((item) => item.id === selectedId) ?? aircraft[0] ?? null, [aircraft, selectedId]);
  const enrichmentSignature = useMemo(() => aircraft.slice(0, 25).map((item) => `${item.id}:${item.callsign}:${item.registration ?? ""}`).join("|"), [aircraft]);

  useEffect(() => {
    let cancelled = false;
    if (!aircraft.length) return;
    setEnrichmentStatus("Identification des vols…");
    const payload = aircraft.slice(0, 25).map((item) => ({ modeS: item.id, registration: item.registration, callsign: item.callsign, operator: item.operator, aircraftType: item.aircraftType, description: item.description, positionSource: item.positionSource, distanceKm: item.distance }));
    fetch("/api/aviation/enriched-aircraft", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aircraft: payload, selectedModeS: selected?.id ?? null }) })
      .then((response) => response.json())
      .then((result) => {
        if (cancelled || !Array.isArray(result.enriched)) return;
        const enrichedItems = (result.enriched as EnrichedAircraft[]).map((item) => {
          if (item.routeLabel) return item;
          const learned = deducedRoute(item.callsignIcao ?? item.rawCallsign);
          if (!learned) return item;
          const retrievedAt = new Date().toISOString();
          return { ...item, departureAirport: learned.departure, arrivalAirport: learned.arrival,
            routeLabel: `${learned.departure.iata ?? learned.departure.icao} → ${learned.arrival.iata ?? learned.arrival.icao}`,
            routeSource: "Observations XavPac" as const, routeConfidence: "inferred" as const,
            routeProvenance: { source: "Observations XavPac", retrievedAt, confidence: "inferred" as const, method: "calculated" as const, freshnessSeconds: Math.max(0, Math.round((Date.now() - Date.parse(learned.latest)) / 1000)) }
          };
        });
        setEnrichedByModeS((current) => ({ ...current, ...Object.fromEntries(enrichedItems.map((item) => [item.modeS, item])) }));
        const aircraftById = new Map(aircraft.map((item) => [item.id.replace(/^~/, "").toUpperCase(), item]));
        const now = new Date();
        const passageBucket = now.toISOString().slice(0, 13);
        recordObservations(enrichedItems.map((item) => {
          const live = aircraftById.get(item.modeS);
          return { id: `${item.modeS}:${passageBucket}`, modeS: item.modeS, callsign: item.callsignIcao ?? item.rawCallsign,
            registration: item.registration, observedAt: now.toISOString(), latitude: live?.latitude ?? 0, longitude: live?.longitude ?? 0,
            distanceKm: live?.distance ?? null, altitudeMeters: live?.barometricAltitude ?? null, operator: item.operator,
            aircraftType: item.aircraftType, photoUrl: item.photo.url, departureAirport: item.departureAirport,
            arrivalAirport: item.arrivalAirport, routeConfidence: item.routeConfidence };
        }));
        setEnrichmentStatus(`${result.metrics?.routesIdentified ?? 0}/${result.metrics?.total ?? result.enriched.length} trajets identifiés`);
      })
      .catch(() => { if (!cancelled) setEnrichmentStatus("Enrichissement momentanément indisponible"); });
    return () => { cancelled = true; };
  // La signature évite de relancer l’enrichissement quand seules les positions changent.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrichmentSignature, selected?.id]);

  const selectedEnriched = selected ? enrichedByModeS[selected.id.replace(/^~/, "").toUpperCase()] ?? null : null;
  const identifiedOperator = selectedEnriched?.operator ?? selected?.operator ?? null;
  const route: FlightRoute | null = selectedEnriched?.departureAirport && selectedEnriched.arrivalAirport ? {
    origin: { name: selectedEnriched.departureAirport.name ?? undefined, municipality: selectedEnriched.departureAirport.municipality ?? undefined, iata_code: selectedEnriched.departureAirport.iata ?? undefined, icao_code: selectedEnriched.departureAirport.icao ?? undefined },
    destination: { name: selectedEnriched.arrivalAirport.name ?? undefined, municipality: selectedEnriched.arrivalAirport.municipality ?? undefined, iata_code: selectedEnriched.arrivalAirport.iata ?? undefined, icao_code: selectedEnriched.arrivalAirport.icao ?? undefined },
    originWeather: null,
    destinationWeather: null
  } : null;

  const visibleAircraft = useMemo(() => {
    return flightOnly ? aircraft.filter((item) => !item.onGround) : aircraft;
  }, [aircraft, flightOnly]);

  const mapPoints = useMemo(
    () => [
      ...(position ? [{
        id: "home",
        lat: position[0],
        lon: position[1],
        name: "Votre position",
        detail: positionStatus,
        color: "#3aa7ff",
        category: "home"
      }] : []),
      ...visibleAircraft.slice(0, 100).map((item) => {
        const visual = aircraftVisual(item);
        const remarkable = detectRemarkable(item, enrichedByModeS[item.id.replace(/^~/, "").toUpperCase()]);
        return {
          id: item.id,
          lat: item.latitude,
          lon: item.longitude,
          name: enrichedByModeS[item.id.replace(/^~/, "").toUpperCase()]?.routeLabel ?? "Trajet non disponible",
          detail: "",
          color: remarkable.length ? "#ff4fd8" : item.id === selected?.id ? "#00b7ff" : visual.color,
          category: remarkable.length ? "remarkable" : visual.category,
          heading: item.trueTrack
        };
      })
    ],
    [position, positionStatus, enrichedByModeS, selected, visibleAircraft]
  );

  const mapTrails = useMemo(
    () => showTrails
      ? visibleAircraft.slice(0, 40).flatMap((item) => {
          const positions = trailsRef.current[item.id] ?? [];
          if (positions.length < 2) return [];
          const visual = aircraftVisual(item);
          return [{ id: item.id, positions, color: item.id === selected?.id ? "#00a8ff" : visual.color, selected: item.id === selected?.id }];
        })
      : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleAircraft, selected, trailsVersion, showTrails]
  );

  const passageById = useMemo(() => {
    const nowMs = Date.now();
    return Object.fromEntries(aircraft.map((item) => [item.id, analyzeAircraftPassage({
      aircraft: {
        modeS: item.id,
        latitude: item.latitude,
        longitude: item.longitude,
        altitudeMeters: item.barometricAltitude,
        groundSpeedMetersPerSecond: item.velocity,
        trackDegrees: item.trueTrack,
        positionTimestampMs: aircraftPositionTimestamp(item.lastPositionAt)
      },
      history: passageHistoryRef.current.get(item.id),
      observer: position,
      gpsAccuracyMeters: accuracy,
      nowMs
    })]));
  // Le compteur rend les nouveaux échantillons du store visibles sans dupliquer l’historique dans l’état React.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aircraft, position, accuracy, passageHistoryVersion]);
  const approach = selected ? passageById[selected.id] ?? null : null;
  const bearing = selected && position ? bearingName(position, [selected.latitude, selected.longitude]) : null;
  const estimatedElevation = selected && selected.barometricAltitude !== null && selected.distance > 0
    ? Math.max(0, Math.min(90, (Math.atan2(selected.barometricAltitude, selected.distance * 1000) * 180) / Math.PI))
    : null;

  const altitudeBands = useMemo(() => {
    const counts = [0, 0, 0, 0, 0];
    for (const item of aircraft) counts[altitudeBand(item.barometricAltitude)] += 1;
    const max = Math.max(1, ...counts);
    return [
      { label: "FL400+", count: counts[4], width: (counts[4] / max) * 100 },
      { label: "FL300 - FL399", count: counts[3], width: (counts[3] / max) * 100 },
      { label: "FL200 - FL299", count: counts[2], width: (counts[2] / max) * 100 },
      { label: "FL100 - FL199", count: counts[1], width: (counts[1] / max) * 100 },
      { label: "FL000 - FL099", count: counts[0], width: (counts[0] / max) * 100 }
    ];
  }, [aircraft]);

  const proximityCounts = useMemo(() => ({
    five: aircraft.filter((item) => item.distance <= 5).length,
    ten: aircraft.filter((item) => item.distance <= 10).length,
    twentyFive: aircraft.filter((item) => item.distance <= 25).length,
    fifty: aircraft.filter((item) => item.distance <= 50).length
  }), [aircraft]);

  const routeQuality = useMemo(() => {
    const values = aircraft.map((item) => enrichmentFor(item)?.routeConfidence ?? "unavailable");
    const confirmed = values.filter((value) => value === "confirmed").length;
    const probable = values.filter((value) => value === "probable").length;
    const inferred = values.filter((value) => value === "inferred").length;
    const unknown = values.filter((value) => value === "unavailable").length;
    const coverage = values.length ? Math.round(((confirmed + probable + inferred) / values.length) * 100) : 0;
    const score = values.length ? Math.round(((confirmed * 100 + probable * 70 + inferred * 40) / values.length)) : 0;
    return { confirmed, probable, inferred, unknown, coverage, score };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aircraft, enrichedByModeS]);

  const remarkableById = useMemo(() => Object.fromEntries(aircraft.map((item) => [item.id, detectRemarkable(item, enrichmentFor(item))])),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [aircraft, enrichedByModeS]);

  function selectAircraft(id: string) {
    setSelectedId(id);
    setManualSelection(true);
  }

  function toggleFavorite(id: string) {
    setFavoriteIds((current) => {
      const next = current.includes(id) ? current.filter((value) => value !== id) : [...current, id];
      try { window.localStorage.setItem("xavpac-favorites", JSON.stringify(next)); } catch {}
      return next;
    });
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen?.();
    }
  }

  function enrichmentFor(item: LiveAircraft) {
    return enrichedByModeS[item.id.replace(/^~/, "").toUpperCase()] ?? null;
  }

  return (
    <section className="flightwall-v61">
      <div className="flightwall-commandbar panel">
        <div className="flightwall-actions">
          <button type="button" className={showTrails ? "fw-action active" : "fw-action"} onClick={() => setShowTrails((value) => !value)}>🛩️ Traces</button>
          <button type="button" className={showCircle ? "fw-action active" : "fw-action"} onClick={() => setShowCircle((value) => !value)}>🎯 Cercles</button>
          <button type="button" className={showFilters ? "fw-action active" : "fw-action"} onClick={() => setShowFilters((value) => !value)}>🔽 Filtres</button>
          <button type="button" className="fw-action">🔔 Remarquables <b>{Object.values(remarkableById).filter((items) => items.length).length}</b></button>
          <button type="button" className="fw-action" onClick={toggleFullscreen}>⛶ Plein écran</button>
        </div>
        <div className="fw-live-summary"><span className={isLive ? "live-dot" : "live-dot off"} /> {sourceStatus} • {enrichmentStatus}</div>
      </div>

      {showFilters && (
        <div className="fw-filterbar panel">
          <button type="button" className={flightOnly ? "active" : ""} onClick={() => setFlightOnly(true)}>En vol uniquement</button>
          <button type="button" className={!flightOnly ? "active" : ""} onClick={() => setFlightOnly(false)}>Tous les appareils</button>
          <span>{favoriteIds.length} favori{favoriteIds.length > 1 ? "s" : ""}</span>
        </div>
      )}

      {(gpsError || error) && <div className="aviation-warning-v5">{gpsError || error}</div>}

      <div className="aviation-quality panel"><div><span>Trafic détecté</span><strong>{aircraft.length} avions</strong></div><div className="confirmed"><span>🟢 Confirmées</span><strong>{routeQuality.confirmed}</strong></div><div className="probable"><span>🟡 Probables</span><strong>{routeQuality.probable}</strong></div><div className="inferred"><span>🔵 Déduites</span><strong>{routeQuality.inferred}</strong></div><div className="unknown"><span>⚪ Inconnues</span><strong>{routeQuality.unknown}</strong></div><div><span>Couverture</span><strong>{routeQuality.coverage} %</strong><small>Qualité pondérée {routeQuality.score} %</small></div></div>

      <div className="flightwall-main-grid">
        <div className="flightwall-left">
          <div className="flightwall-map-card panel">
            <div className="flightwall-map-stage">
              <StableMap
                  points={mapPoints}
                  center={position ?? OPERATIONAL_MAP_CENTER}
                  radiusKm={radius}
                  showRadius={showCircle}
                  selectedId={selected?.id}
                  trails={mapTrails}
                  onSelect={selectAircraft}
                  mapVariant={mapStyle}
                  focusSignal={locateSignal}
                />

              <div className="fw-map-style">
                <button className={mapStyle === "street" ? "active" : ""} onClick={() => setMapStyle("street")} type="button">Plan lisible</button>
                <button className={mapStyle === "satellite" ? "active" : ""} onClick={() => setMapStyle("satellite")} type="button">Satellite</button>
                <button className={mapStyle === "dark" ? "active" : ""} onClick={() => setMapStyle("dark")} type="button">Mode sombre</button>
              </div>

              <div className="fw-radius-selector">
                {[20, 50, 100].map((value) => (
                  <button type="button" key={value} className={radius === value ? "active" : ""} onClick={() => setRadius(value as Radius)}>{value} km</button>
                ))}
              </div>

              <div className="fw-map-counters">
                <div><span>✈️</span><strong>{aircraft.filter((item) => !item.onGround).length}</strong><small>En vol</small></div>
                <div><span>🎯</span><strong>{position ? aircraft.filter((item) => item.distance <= 20).length : "—"}</strong><small>À proximité</small></div>
                <div><span>🛬</span><strong>{aircraft.filter((item) => item.onGround).length}</strong><small>Au sol</small></div>
              </div>

              <button type="button" disabled={!position} className="fw-locate-button" title="Recentrer sur ma position" aria-label="Recentrer sur ma position" onClick={() => setLocateSignal((value) => value + 1)}>📍</button>

            </div>
          </div>

          <div className="flightwall-bottom-grid">
            <article className="fw-data-card panel fw-radar-card">
              <header><strong>Mini radar local</strong><span>Rayon {radius} km</span></header>
              <div className="fw-radar-layout">
                <div className="mini-radar fw-large-radar">
                  <span className="radar-axis horizontal" /><span className="radar-axis vertical" />
                  <span className="radar-circle one" /><span className="radar-circle two" /><span className="radar-circle three" /><span className="radar-center" />
                  {position && aircraft.slice(0, 22).map((item) => <button type="button" key={item.id} className={item.id === selected?.id ? "radar-blip selected" : "radar-blip"} style={radarCoordinates(position, item, radius)} onClick={() => selectAircraft(item.id)} title={item.callsign} />)}
                </div>
                <div className="fw-proximity-grid">
                  <div><span>≤ 5 km</span><strong>{proximityCounts.five}</strong></div>
                  <div><span>≤ 10 km</span><strong>{proximityCounts.ten}</strong></div>
                  <div><span>≤ 25 km</span><strong>{proximityCounts.twentyFive}</strong></div>
                  <div><span>≤ 50 km</span><strong>{proximityCounts.fifty}</strong></div>
                  <div className="nearest"><span>Le plus proche</span><strong>{aircraft[0] ? `${aircraft[0].distance.toFixed(1)} km` : "—"}</strong></div>
                </div>
              </div>
            </article>

            <article className="fw-data-card panel fw-nearest-card">
              <header><div><strong>Les 5 prochains avions</strong><span>Appareils les plus proches de votre position</span></div></header>
              <div className="fw-nearest-list">
                {aircraft.slice(0, 5).map((item, index) => {
                  const enriched = enrichmentFor(item);
                  const passage = passageById[item.id] ?? null;
                  const identity = enriched?.flightNumberIata ?? enriched?.callsignIcao ?? enriched?.rawCallsign ?? item.callsign;
                  const identityKind = enriched?.flightNumberIata ? "Vol IATA" : enriched?.callsignIcao ? "Callsign ICAO" : "Identifiant ADS-B";
                  const remarkable = remarkableById[item.id]?.[0];
                  return <button type="button" key={item.id} onClick={() => selectAircraft(item.id)} className={item.id === selected?.id ? "selected" : ""}>
                    <b>{remarkable ? remarkable.icon : index + 1}</b>
                    <strong>{identity}<small>{identityKind} • {enriched?.operator ?? item.operator ?? "Compagnie non identifiée"}</small></strong>
                    <span>{enriched?.routeLabel ?? "Départ / arrivée non disponibles"}<small>{enriched?.aircraftType ?? item.aircraftType ?? "Type non disponible"} • {formatAltitude(item.barometricAltitude)}</small></span>
                    <em>{position ? `${item.distance.toFixed(1)} km` : "Distance —"}<small>{passage?.status === "approaching" ? passage.estimatedSecondsToClosest === null ? "En rapprochement" : `Passage estimé dans ${formatDuration(passage.estimatedSecondsToClosest)}` : passage?.status === "closest" ? "Au plus près" : passage?.status === "receding" ? "En éloignement" : passage?.status === "non-convergent" ? "Non convergent" : "Analyse en attente"} • {confidenceLabels[enriched?.routeConfidence ?? "unavailable"]}</small></em>
                  </button>;
                })}
                {!aircraft.length && <p className="fw-empty-text">Aucun appareil reçu dans ce rayon.</p>}
              </div>
            </article>

            <article className="fw-data-card panel fw-altitude-card">
              <header><div><strong>Altitudes des avions</strong><span>Répartition par tranche d’altitude</span></div></header>
              <div className="fw-altitude-bars">
                {altitudeBands.map((band, index) => <div key={band.label}><span>{band.label}</span><i style={{ width: `${band.width}%` }} className={`band-${index}`} /><strong>{band.count}</strong></div>)}
              </div>
            </article>
          </div>
          <article className="panel aviation-news-panel"><header><div><span className="eyebrow">ACTUALITÉS AÉRONAUTIQUES</span><h3>Événements des 7 derniers jours</h3></div><small>Informations réelles selon disponibilité des éditeurs</small></header><div className="aviation-news-list">{news.length ? news.map((item) => <a key={`${item.date}-${item.title}`} href={item.link} target="_blank" rel="noreferrer"><time>{new Date(item.date).toLocaleDateString("fr-FR")}</time><div><strong>{item.title}</strong><p>{item.summary || "Résumé non disponible."}</p><small>{item.location} • {item.source}</small></div><span>↗</span></a>) : <p className="fw-empty-text">Aucune actualité disponible pour les sept derniers jours.</p>}</div></article>
        </div>

        <aside className="flightwall-focus panel">
          {selected ? (
            <>
              <div className="fw-focus-header">
                <div><span className="fw-kicker">AVION SÉLECTIONNÉ</span><div className="fw-title-line"><h2>{selectedEnriched?.flightNumberIata ?? selectedEnriched?.callsignIcao ?? selected.callsign}</h2><button type="button" className={favoriteIds.includes(selected.id) ? "fw-favorite active" : "fw-favorite"} onClick={() => toggleFavorite(selected.id)} aria-label="Ajouter aux favoris">☆</button></div><div className="fw-airline-brand">{selectedEnriched ? <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={selectedEnriched.logo} alt={`Logo ${selectedEnriched.operator ?? "compagnie"}`} onError={(event) => { event.currentTarget.src = "/airlines/generic-airline.svg"; }} />
                  <strong>{selectedEnriched.operator ?? "Opérateur non identifié"}</strong></> : <strong>{identifiedOperator ?? "Opérateur non identifié"}</strong>}</div><p>{selectedEnriched?.aircraftType ?? selected.aircraftType ?? selected.description ?? "Type non disponible"}</p></div>
                <div className="fw-aircraft-photo">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={selectedEnriched?.photo.url ?? "/aircraft/generic-aircraft.jpg"} alt={`Appareil ${selected.callsign}`} onError={(event) => { event.currentTarget.src = "/aircraft/generic-aircraft.jpg"; }} />
                  <small>{selectedEnriched ? `${selectedEnriched.photo.label} • ${selectedEnriched.photo.source}${selectedEnriched.photo.photographer ? ` • ${selectedEnriched.photo.photographer}` : ""}` : "Illustration générique"}</small>
                </div>
              </div>

              <div className="fw-identity-grid">
                <div><span>Immatriculation</span><strong>{selectedEnriched?.registration ?? selected.registration ?? "—"}</strong></div>
                <div><span>Type</span><strong>{selectedEnriched?.aircraftType ?? selected.aircraftType ?? "—"}</strong></div>
                <div><span>Mode S</span><strong>{selected.id.toUpperCase()}</strong></div>
              </div>

              <div className={`fw-passage-card passage-${approach?.status ?? "unavailable"}`}>
                <div className="fw-passage-summary"><span>Passage au plus près de ma position GPS</span><h3>{passageTitle(approach)}</h3><p>{passageDetail(approach)}</p></div>
                <div className="fw-passage-minimum">
                  <span>{approach?.status === "receding" || approach?.status === "closest" ? "Distance minimale observée" : "Distance minimale estimée"}</span>
                  <strong>{approach?.status === "receding" || approach?.status === "closest"
                    ? approach.observedMinimumDistanceKm === null ? "—" : `${approach.observedMinimumDistanceKm.toFixed(1)} km`
                    : approach?.estimatedMinimumDistanceKm === null || approach?.estimatedMinimumDistanceKm === undefined ? "—" : `≈ ${approach.estimatedMinimumDistanceKm.toFixed(1)} km`}</strong>
                  <small>{approach?.passageSide ? `Passage probable au ${approach.passageSide}` : "Côté non estimé"}</small>
                </div>
                <div className="fw-passage-metrics">
                  <div><span>Distance actuelle</span><strong>{approach?.currentDistanceKm === null || approach?.currentDistanceKm === undefined ? "—" : `${approach.currentDistanceKm.toFixed(1)} km`}</strong></div>
                  <div><span>Évolution</span><strong>{formatDistanceEvolution(approach)}</strong></div>
                  <div><span>Vitesse relative</span><strong>{formatRelativeSpeed(approach)}</strong></div>
                  <div><span>Fraîcheur ADS-B</span><strong>{formatFreshness(approach?.freshnessSeconds ?? null)}</strong></div>
                </div>
                <div className={`fw-passage-progress ${approach?.status ?? "unavailable"}`}>
                  <div className="fw-passage-phase-labels"><span>APPROCHE</span><span>PLUS PROCHE</span><span>ÉLOIGNEMENT</span></div>
                  <div className="fw-passage-track" aria-label="Progression réelle du passage">
                    <i className="approach-zone" /><i className="closest-zone" /><i className="receding-zone" />
                    {approach?.progressPercent !== null && approach?.progressPercent !== undefined && <b style={{ left: `${approach.progressPercent}%` }} />}
                  </div>
                  <small>{approach?.progressPercent === null || approach?.progressPercent === undefined
                    ? passageTitle(approach)
                    : "Position calculée dans la zone de passage de 10 km — aucune animation fictive"}</small>
                </div>
                {approach?.gpsAccuracyLimited && <div className="fw-passage-warning">Estimation limitée par une précision GPS de ± {Math.round(approach.gpsAccuracyMeters ?? 0)} mètres</div>}
              </div>

              <div className="fw-look-grid">
                <div><span>Où regarder ?</span><strong>{bearing?.label ?? "—"}</strong></div>
                <div><span>Angle d’élévation estimé</span><strong>{estimatedElevation === null ? "—" : `${Math.round(estimatedElevation)}°`}</strong></div>
                <div><span>Distance actuelle</span><strong>{position ? `${selected.distance.toFixed(1)} km` : "Non déterminée"}</strong></div>
                <div><span>Vitesse sol</span><strong>{formatSpeedKnots(selected.velocity)}</strong></div>
              </div>

              <div className={route ? "fw-route-card" : "fw-route-card unavailable"}>
                <div><span>Départ</span><strong>{route?.origin.iata_code ?? route?.origin.icao_code ?? "?"}</strong><small>{route ? `${route.origin.municipality ?? "Non déterminé"} • ${route.origin.name ?? "Non déterminé"}` : "Non déterminé"}</small></div>
                <div className="fw-route-line">✈︎ <i /> ✈︎</div>
                <div><span>Arrivée</span><strong>{route?.destination.iata_code ?? route?.destination.icao_code ?? "?"}</strong><small>{route ? `${route.destination.municipality ?? "Non déterminé"} • ${route.destination.name ?? "Non déterminé"}` : "Non déterminé"}</small></div>
              </div>
              <div className={`fw-route-confidence ${selectedEnriched?.routeConfidence ?? "unavailable"}`}>Trajet {confidenceLabels[selectedEnriched?.routeConfidence ?? "unavailable"]} • {selectedEnriched?.routeSource ?? "aucune source"}</div>

              {remarkableById[selected.id]?.length > 0 && <div className="remarkable-card"><span>APPAREIL REMARQUABLE</span>{remarkableById[selected.id].map((item) => <div key={item.key}><strong>{item.icon} {item.label}</strong><small>{item.confidence === "confirmed" ? "🟢 Confirmée" : "🟡 Probable"} • {item.evidence}</small></div>)}</div>}

              <div className="fw-telemetry-grid">
                <div><span>Altitude</span><strong>{formatFlightLevel(selected.barometricAltitude)}</strong><small>{formatAltitude(selected.barometricAltitude)}</small></div>
                <div><span>Vitesse</span><strong>{formatSpeedKnots(selected.velocity)}</strong><small>{formatSpeedKmh(selected.velocity)}</small></div>
                <div><span>Cap</span><strong>{selected.trueTrack === null ? "—" : `${Math.round(selected.trueTrack)}°`}</strong><small>{directionName(selected.trueTrack).split(" • ")[0]}</small></div>
                <div><span>Vertical</span><strong>{formatVertical(selected.verticalRate)}</strong><small>{selected.onGround ? "Au sol" : (selected.verticalRate ?? 0) > 0.5 ? "Montée" : (selected.verticalRate ?? 0) < -0.5 ? "Descente" : "Palier"}</small></div>
              </div>

              <div className="fw-source-grid">
                <div><span>Source</span><strong>Airplanes.live</strong></div>
                <div><span>Suivi</span><strong>ADS-B</strong></div>
                <div><span>Position ADS-B</span><strong>{formatFreshness(approach?.freshnessSeconds ?? null)}</strong></div>
                <div><span>Identification du vol</span><strong>{selectedEnriched?.flightNumberIata ? `${selectedEnriched.flightNumberIata} • numéro commercial IATA` : selectedEnriched?.callsignIcao ? `${selectedEnriched.callsignIcao} • callsign ICAO` : `${selected.callsign} • identifiant ADS-B`}</strong></div>
              </div>
              <div className="fw-provenance-card"><strong>Traçabilité du trajet</strong><span>Source : {selectedEnriched?.routeProvenance.source ?? "Aucune"}</span><span>Récupération : {selectedEnriched ? new Date(selectedEnriched.routeProvenance.retrievedAt).toLocaleString("fr-FR") : "—"}</span><span>Méthode : {selectedEnriched?.routeProvenance.method ?? "—"}</span><span>Fraîcheur : {selectedEnriched ? `${selectedEnriched.routeProvenance.freshnessSeconds} s` : "—"}</span></div>

              {route && <div className="fw-weather-strip route-only-weather">
                <header><div><span>MÉTÉO DU VOL</span><strong>Départ et arrivée uniquement</strong></div><small>Open-Meteo</small></header>
                <div>
                  {route && ([{ airport: route.origin, weather: route.originWeather }, { airport: route.destination, weather: route.destinationWeather }]).map(({ airport, weather }) => (
                    <article key={airport.icao_code ?? airport.name}><span>{airport.municipality ?? airport.name ?? "Aéroport"}</span><strong>{typeof weather?.temperature_2m === "number" ? `${Math.round(weather.temperature_2m)}°C` : "—"}</strong><small>{weatherCondition(weather?.weather_code)}</small><small>Vent {typeof weather?.wind_speed_10m === "number" ? `${Math.round(weather.wind_speed_10m)} kt` : "—"} • Rafales {typeof weather?.wind_gusts_10m === "number" ? `${Math.round(weather.wind_gusts_10m)} kt` : "—"}</small><small>Visibilité {weatherVisibility(weather?.visibility ?? null)} • Pression {typeof weather?.surface_pressure === "number" ? `${Math.round(weather.surface_pressure)} hPa` : "—"}</small><small>Plafond : non fourni par cette source • MAJ {weather?.time ? new Date(weather.time).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—"}</small></article>
                  ))}
                </div>
              </div>}
            </>
          ) : (
            <div className="focus-empty"><span>✈</span><h2>Aucun avion détecté</h2><p>Aucun appareil ADS-B reçu dans un rayon de {radius} km.</p><small>{sourceStatus}</small></div>
          )}
        </aside>
      </div>

      <div className="flightwall-statusline"><span>Données en direct et temps réel</span><span>GPS : {positionStatus}</span><span><i className="live-dot" /> Prochaine actualisation : 10 s</span></div>
    </section>
  );
}
