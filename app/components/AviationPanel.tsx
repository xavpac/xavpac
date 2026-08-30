"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import AircraftPhoto from "./aviation/AircraftPhoto";
import AircraftStandbyView from "./aviation/AircraftStandbyView";
import AircraftView from "./aviation/AircraftView";
import FlightMetrics from "./aviation/FlightMetrics";
import OperatorBrand from "./aviation/OperatorBrand";
import { useAviationAudio } from "../hooks/useAviationAudio";
import { XAVPAC_HOME } from "../config/home";
import { useLiveGeolocation } from "../hooks/useLiveGeolocation";
import { reportDataUpdate } from "../lib/buildInfo";
import type { AirportIdentity, AirportWeather, EnrichedAircraft, RouteConfidence } from "../lib/aviation/types";
import { readLearnedAircraftIdentity, rememberAircraftIdentities } from "../lib/aviation/identityMemory";
import { countRecordedPassages, deducedRoute, recordObservations } from "../lib/aviation/observations";
import { detectRemarkable } from "../lib/aviation/remarkable";
import { nationalAssetsInsideRadius, nationalAssetToAircraft, nationalMarkerCategory, type NationalAssetSignal, type NearbyNationalAsset } from "../lib/aviation/nationalAlerts";
import { AVIATION_RADIUS_OPTIONS, normalizeAviationRadius, type AviationRadius } from "../lib/aviation/alertSettings";
import { buildSpotterSkyMood, spotterChallengeScore } from "../lib/aviation/spotterFun";
import { appendObservedPosition, buildSelectedTrail } from "../lib/aviation/selectedTrail";
import { rankWatchNow } from "../lib/aviation/watchNow";
import { distanceKm } from "../lib/aviation/geometry";
import { routeCanUseAirportWeather, routeWeatherKey, weatherCondition, weatherVisibility } from "../lib/aviation/routeWeather";
import { resolvePreferredAircraftId } from "../lib/aviation/selection";
import { aircraftSoundNature } from "../lib/aviation/audioSignatures";
import { enterFullscreenIfAvailable, exitFullscreenIfActive, isFullscreenActive } from "../lib/fullscreen";
import {
  getBrowserStorage,
  initializeBrowserStorage,
  normalizeStoredManualObserver,
  normalizeStringArray,
  parseStoredJson,
  safeGetItem,
  safeRemoveItem,
  safeSetItem,
  safeWriteCoordinatePair,
  safeWriteJson,
  XAVPAC_STORAGE_KEYS
} from "../lib/safeStorage";
import { detectReferenceDevice, resolveReference, type ReferenceDevice, type ReferenceGpsFix, type ReferencePreference } from "../lib/referenceResolver";
import type { AircraftWithDistance, LiveAircraft } from "../lib/aviation/liveAircraft";
import type { MapStyle } from "../lib/map/types";
import type { MapCameraCommand, MapCameraMode } from "./StableMap";
import {
  aircraftPositionTimestamp,
  analyzeAircraftPassage,
  PassageHistoryStore,
  type PassageAnalysis
} from "../lib/aviation/passageTracker";

const StableMap = dynamic(() => import("./StableMap"), { ssr: false });
const FRANCE_OVERVIEW_CENTER: [number, number] = [46.603354, 1.888334];
const MANUAL_OBSERVER_KEY = XAVPAC_STORAGE_KEYS.manualObserver;
const SAVED_HOME_KEY = XAVPAC_STORAGE_KEYS.savedHome;

type ObserverReference = "moi" | "home" | "manual";

type FlightRoute = { origin: AirportIdentity; destination: AirportIdentity; originWeather: AirportWeather | null; destinationWeather: AirportWeather | null };
type AviationNews = { date: string; title: string; summary: string; location: string; source: string; link: string };
type ProviderHealth = { id: string; name: string; state: "available" | "degraded" | "offline" | "disabled"; lastSuccess: string | null };

const routeQualifiers: Record<RouteConfidence, string> = {
  confirmed: "Route confirmée",
  probable: "Route probable",
  inferred: "Route déduite",
  unavailable: "Route non déterminée"
};

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
  if (!analysis || analysis.status === "no-observer") return "Position d’observation requise";
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
  if (!analysis) return "Le calcul utilise uniquement la position d’observation affichée.";
  if (analysis.status === "non-convergent") return "L’appareil ne devrait pas passer à proximité immédiate de votre position.";
  if (analysis.status === "insufficient") return "Distance stable ou données de trajectoire insuffisantes.";
  if (analysis.status === "approaching" && analysis.estimatedSecondsToClosest === null) return "Rapprochement mesuré ; estimation temporelle indisponible sans cap et vitesse complets.";
  if (analysis.status === "receding") return "La distance augmente après le minimum observé.";
  if (analysis.status === "closest") return "Minimum observé et projection de trajectoire concordants.";
  return "Calcul recalculé à chaque nouvelle position ADS-B.";
}

function formatFreshness(seconds: number | null) {
  if (seconds === null) return "Non déterminée";
  return seconds < 1 ? "À l’instant" : `${Math.round(seconds)} s`;
}

function compactFreshness(timestamp: string | null) {
  if (!timestamp) return "MAJ inconnue";
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return "MAJ inconnue";
  const seconds = Math.max(0, Math.round((Date.now() - parsed) / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${String(seconds % 60).padStart(2, "0")}`;
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
  if (/(heli|hélic|rotor|h125|h135|h145|ec135|ec145|as[ .-]?350|as50|écureuil|squirrel|condor[a-z]?)/i.test(text)) return { category: "helicopter", color: "#4fa8ff" };
  if (/(airship|dirigeable|zeppelin|\bzep\b|\blta\b)/i.test(text)) return { category: "airship", color: "#ff9fe5" };
  if (/(balloon|ballon|montgolfière)/i.test(text)) return { category: "balloon", color: "#f28dff" };
  if (/(gyro|autogire|gyrocopter)/i.test(text)) return { category: "autogyro", color: "#74e5bd" };
  if (/(glider|planeur|sailplane)/i.test(text)) return { category: "glider", color: "#75d9ff" };
  if (/(military|armée|air force|fighter|rafale|mirage|trainer)/i.test(text)) return { category: "military", color: "#ff5e78" };
  if (/(cessna|piper|robin|cirrus|ultralight|ulm|bristell)/i.test(text)) return { category: "light", color: "#bc83ff" };
  return { category: "commercial", color: "#ffb000" };
}

function enrichmentInputKey(item: LiveAircraft) {
  return [item.id, item.callsign, item.registration, item.operator, item.aircraftType, item.description, item.category]
    .map((value) => value?.trim() ?? "")
    .join(":");
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

function tactileFeedback(pattern: number | number[] = 10) {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  navigator.vibrate(pattern);
}

export default function AviationPanel() {
  const { position, status: positionStatus, accuracy, timestamp: gpsTimestamp, quality: gpsQuality, qualityReason: gpsQualityReason, usableForPreciseCalculations, isLive, retryGeolocation, error: gpsError } = useLiveGeolocation();
  const { enabled: soundsEnabled, ready: soundsReady, setSoundEnabled, unlock: unlockAudio, quietAircraftChange, nationalAssetAlert, previewAircraftChange, previewNationalAsset } = useAviationAudio();
  const [radius, setRadius] = useState<AviationRadius>(50);
  const [manualObserver, setManualObserver] = useState<[number, number] | null>(null);
  const [referencePreference, setReferencePreference] = useState<ReferencePreference>("auto");
  const [referenceDevice, setReferenceDevice] = useState<ReferenceDevice>("desktop");
  const [observerCommune, setObserverCommune] = useState("");
  const [observerCoordinates, setObserverCoordinates] = useState("");
  const [observerMessage, setObserverMessage] = useState("");
  const [savedHome, setSavedHome] = useState<[number, number] | null>(XAVPAC_HOME.position);
  const [aircraft, setAircraft] = useState<AircraftWithDistance[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [manualSelection, setManualSelection] = useState(false);
  const [selectionDismissed, setSelectionDismissed] = useState(false);
  const [sourceStatus, setSourceStatus] = useState("Connexion Airplanes.live…");
  const [trafficSource, setTrafficSource] = useState("Airplanes.live");
  const [error, setError] = useState("");
  const [enrichedByModeS, setEnrichedByModeS] = useState<Record<string, EnrichedAircraft>>({});
  const [enrichmentStatus, setEnrichmentStatus] = useState("Enrichissement en attente");
  const [routeWeather, setRouteWeather] = useState<{ key: string | null; status: "idle" | "loading" | "ready" | "unavailable"; origin: AirportWeather | null; destination: AirportWeather | null }>({ key: null, status: "idle", origin: null, destination: null });
  const [mapStyle, setMapStyle] = useState<MapStyle>("street");
  const [showTrails, setShowTrails] = useState(true);
  const [showCircle, setShowCircle] = useState(true);
  const [cameraMode, setCameraMode] = useState<MapCameraMode>("focus");
  const [cameraCommand, setCameraCommand] = useState<MapCameraCommand | null>(null);
  const [news, setNews] = useState<AviationNews[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [flightOnly, setFlightOnly] = useState(true);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [showAircraftView, setShowAircraftView] = useState(false);
  const [nearbyNationalAlert, setNearbyNationalAlert] = useState<NearbyNationalAsset | null>(null);
  const [nearbyNationalAssets, setNearbyNationalAssets] = useState<NearbyNationalAsset[]>([]);
  const [providerHealth, setProviderHealth] = useState<ProviderHealth[]>([]);
  const [trafficUpdatedAt, setTrafficUpdatedAt] = useState<string | null>(null);
  const aircraftViewRef = useRef<HTMLDivElement>(null);
  const aircraftViewContentRef = useRef<HTMLDivElement>(null);
  const nativeFullscreenRef = useRef(false);
  const previousViewAircraftRef = useRef<string | null>(null);
  const aircraftViewWaitingRef = useRef(false);
  const cameraCommandIdRef = useRef(0);
  const alertedNationalAssetsRef = useRef(new Set<string>());
  const trailsRef = useRef<Record<string, [number, number][]>>({});
  const [trailsVersion, setTrailsVersion] = useState(0);
  const passageHistoryRef = useRef(new PassageHistoryStore());
  const enrichedInputSignaturesRef = useRef(new Map<string, string>());
  const identityStatusByModeSRef = useRef(new Map<string, EnrichedAircraft["identityStatus"]>());
  const [passageHistoryVersion, setPassageHistoryVersion] = useState(0);
  const lastValidGpsRef = useRef<ReferenceGpsFix | null>(null);
  const gpsFix: ReferenceGpsFix | null = position ? {
    position,
    accuracyMeters: accuracy,
    timestampMs: gpsTimestamp,
    quality: gpsQuality,
    usable: usableForPreciseCalculations
  } : null;
  if (gpsFix?.usable) lastValidGpsRef.current = gpsFix;
  const resolvedReference = resolveReference({
    device: referenceDevice,
    preference: referencePreference,
    explicitPosition: manualObserver,
    home: savedHome,
    gps: gpsFix,
    lastValidGps: lastValidGpsRef.current
  });
  const observerReference: ObserverReference = resolvedReference.kind === "home"
    ? "home"
    : resolvedReference.kind === "moi"
      ? "moi"
      : "manual";
  const observerPosition = resolvedReference.position;
  const observerStatus = observerReference === "moi"
    ? resolvedReference.usedLastValidGps
      ? `MOI • dernière position GPS valide${lastValidGpsRef.current?.accuracyMeters === null ? "" : ` ±${Math.round(lastValidGpsRef.current?.accuracyMeters ?? 0)} m`}`
      : positionStatus
    : observerPosition
      ? `${observerReference === "home" ? "HOME" : "POINT CHOISI"} • ${observerPosition[0].toFixed(5)} / ${observerPosition[1].toFixed(5)}`
      : "Référence indisponible";
  const observerAccuracy = observerReference === "moi"
    ? resolvedReference.usedLastValidGps ? lastValidGpsRef.current?.accuracyMeters ?? null : accuracy
    : null;

  useEffect(() => {
    initializeBrowserStorage();
    const local = getBrowserStorage("local");
    const session = getBrowserStorage("session");
    setReferenceDevice(detectReferenceDevice({
      userAgent: navigator.userAgent,
      maxTouchPoints: navigator.maxTouchPoints,
      coarsePointer: window.matchMedia?.("(pointer: coarse)").matches ?? false
    }));
    setFavoriteIds(normalizeStringArray(parseStoredJson(safeGetItem(local, XAVPAC_STORAGE_KEYS.favorites))));
    setRadius(normalizeAviationRadius(safeGetItem(local, XAVPAC_STORAGE_KEYS.aviationRadius)));
    safeWriteCoordinatePair(local, SAVED_HOME_KEY, XAVPAC_HOME.position);
    setSavedHome(XAVPAC_HOME.position);
    const storedObserver = normalizeStoredManualObserver(parseStoredJson(safeGetItem(session, MANUAL_OBSERVER_KEY)));
    if (storedObserver) {
      setManualObserver(storedObserver.position);
      setReferencePreference(storedObserver.reference);
      setObserverCoordinates(`${storedObserver.position[0]}, ${storedObserver.position[1]}`);
      setObserverMessage(storedObserver.reference === "home" ? `HOME sélectionné volontairement • ${XAVPAC_HOME.address}` : "Point d’observation conservé pendant la navigation.");
    } else {
      setManualObserver(null);
      setReferencePreference("auto");
      setObserverCoordinates("");
      setObserverMessage("Référence automatique : MOI sur smartphone, HOME sur Mac.");
    }
  }, []);

  useEffect(() => {
    if (!showAircraftView) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowAircraftView(false);
    };
    const closeAfterFullscreen = () => {
      if (nativeFullscreenRef.current && !isFullscreenActive()) {
        nativeFullscreenRef.current = false;
        setShowAircraftView(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    document.addEventListener("fullscreenchange", closeAfterFullscreen);
    document.addEventListener("webkitfullscreenchange", closeAfterFullscreen);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("fullscreenchange", closeAfterFullscreen);
      document.removeEventListener("webkitfullscreenchange", closeAfterFullscreen);
    };
  }, [showAircraftView]);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      if (!observerPosition) {
        setAircraft([]);
        setSelectedId(null);
        setSourceStatus("Position requise pour rechercher les avions proches");
        return;
      }
      try {
        setError("");
        const center = observerPosition;
        const response = await fetch(`/api/aircraft?lat=${center[0]}&lon=${center[1]}&radius=${radius}`, { cache: "no-store" });
        const payload = await response.json();
        if (cancelled) return;

        if (!response.ok) {
          const source = typeof payload.source === "string" ? payload.source : "Airplanes.live";
          setSourceStatus(`${source} indisponible • dernière situation conservée`);
          setError(payload.error ?? "Source aérienne momentanément indisponible.");
          return;
        }

        const sorted: AircraftWithDistance[] = (Array.isArray(payload.aircraft) ? payload.aircraft : [])
          .map((item: LiveAircraft) => ({ ...item, distance: distanceKm(center, [item.latitude, item.longitude]) }))
          .filter((item: AircraftWithDistance) => item.distance <= radius + 1)
          .sort((a: AircraftWithDistance, b: AircraftWithDistance) => a.distance - b.distance);

        setAircraft(sorted);
        reportDataUpdate("aviation");

        for (const item of sorted.slice(0, 80)) {
          const current = trailsRef.current[item.id] ?? [];
          const nextPoint: [number, number] = [item.latitude, item.longitude];
          trailsRef.current[item.id] = appendObservedPosition(current, nextPoint);
        }
        setTrailsVersion((value) => value + 1);

        if (observerPosition) {
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
              observer: observerPosition,
              observerTimestampMs: observerReference === "moi" ? gpsTimestamp : Date.now()
            }) || historyChanged;
          }
          if (historyChanged) setPassageHistoryVersion((value) => value + 1);
        }

        const source = typeof payload.source === "string" ? payload.source : "Airplanes.live";
        setTrafficSource(source);
        setTrafficUpdatedAt(typeof payload.fetchedAt === "string" ? payload.fetchedAt : new Date().toISOString());
        const withoutPosition = Number(payload.detection?.withoutPosition) || 0;
        setSourceStatus(`${source} • ${sorted.length} appareil${sorted.length > 1 ? "s" : ""}${withoutPosition ? ` • ${withoutPosition} signal${withoutPosition > 1 ? "s" : ""} sans position` : ""}`);
      } catch {
        if (!cancelled) {
          setSourceStatus("Airplanes.live indisponible • dernière situation conservée");
          setError("Impossible d’actualiser le trafic aérien en direct.");
        }
      }
    }

    refresh();
    const timer = window.setInterval(refresh, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [observerPosition, observerReference, radius, manualSelection, selectedId, selectionDismissed, gpsTimestamp, nearbyNationalAssets]);

  useEffect(() => {
    fetch("/api/aviation-news", { cache: "no-store" }).then((response) => response.json()).then((payload) => setNews(Array.isArray(payload.news) ? payload.news : [])).catch(() => setNews([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function refreshHealth() {
      try {
        const response = await fetch("/api/source-health", { cache: "no-store" });
        const payload = await response.json();
        if (!cancelled) setProviderHealth(Array.isArray(payload.sources) ? payload.sources : []);
      } catch {
        if (!cancelled) setProviderHealth([]);
      }
    }
    void refreshHealth();
    const timer = window.setInterval(refreshHealth, 60_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  const selected = useMemo(() => {
    if (selectionDismissed) return null;
    if (selectedId) {
      const directAircraft = aircraft.find((item) => item.id === selectedId);
      if (directAircraft) return directAircraft;
      const nationalAsset = nearbyNationalAssets.find((item) => item.id === selectedId);
      return nationalAsset ? nationalAssetToAircraft(nationalAsset) : null;
    }
    return nearbyNationalAssets[0] ? nationalAssetToAircraft(nearbyNationalAssets[0]) : aircraft[0] ?? null;
  }, [aircraft, nearbyNationalAssets, selectedId, selectionDismissed]);
  const selectedEnriched = selected ? enrichedByModeS[selected.id.replace(/^~/, "").toUpperCase()] ?? null : null;

  useEffect(() => {
    const nextId = resolvePreferredAircraftId({
      aircraftIds: aircraft.map((item) => item.id),
      nationalAssetIds: nearbyNationalAssets.map((item) => item.id),
      selectedId,
      manualSelection,
      selectionDismissed
    });
    if (nextId !== selectedId) setSelectedId(nextId);
    if (manualSelection && selectedId && nextId !== selectedId) setManualSelection(false);
  }, [aircraft, manualSelection, nearbyNationalAssets, selectedId, selectionDismissed]);
  const enrichableAircraft = useMemo(() => {
    const byId = new Map(aircraft.map((item) => [item.id, item]));
    for (const asset of nearbyNationalAssets) {
      if (!byId.has(asset.id)) byId.set(asset.id, nationalAssetToAircraft(asset));
    }
    return [...byId.values()];
  }, [aircraft, nearbyNationalAssets]);
  const enrichmentSignature = useMemo(() => enrichableAircraft.map(enrichmentInputKey).join("|"), [enrichableAircraft]);

  useEffect(() => {
    if (!showAircraftView) {
      previousViewAircraftRef.current = null;
      aircraftViewWaitingRef.current = false;
      return;
    }
    if (!selected) {
      previousViewAircraftRef.current = null;
      aircraftViewWaitingRef.current = true;
      return;
    }
    const previous = previousViewAircraftRef.current;
    if ((previous && previous !== selected.id) || aircraftViewWaitingRef.current) quietAircraftChange(aircraftSoundNature(
      selected.callsign,
      selected.registration,
      selected.aircraftType,
      selected.description,
      selected.operator,
      selected.category,
      selectedEnriched?.aircraftType,
      selectedEnriched?.operator
    ));
    aircraftViewWaitingRef.current = false;
    previousViewAircraftRef.current = selected.id;
  }, [quietAircraftChange, selected, selectedEnriched, showAircraftView]);

  useEffect(() => {
    let cancelled = false;
    const alertObserver = observerPosition;
    if (!alertObserver) {
      setNearbyNationalAlert(null);
      setNearbyNationalAssets([]);
      return;
    }
    const alertCenter: [number, number] = alertObserver;

    async function refreshNationalAlert() {
      try {
        const response = await fetch("/api/national-assets", { cache: "no-store" });
        const payload = await response.json();
        if (cancelled) return;
        const inside = nationalAssetsInsideRadius(Array.isArray(payload.assets) ? payload.assets as NationalAssetSignal[] : [], alertCenter, radius);
        let trailChanged = false;
        for (const asset of inside) {
          const current = trailsRef.current[asset.id] ?? [];
          const next = appendObservedPosition(current, [asset.latitude, asset.longitude]);
          if (next !== current) {
            trailsRef.current[asset.id] = next;
            trailChanged = true;
          }
        }
        if (trailChanged) setTrailsVersion((value) => value + 1);
        const currentIds = new Set(inside.map((asset) => asset.id));
        for (const id of alertedNationalAssetsRef.current) {
          if (!currentIds.has(id)) alertedNationalAssetsRef.current.delete(id);
        }
        setNearbyNationalAssets(inside);
        setNearbyNationalAlert(inside[0] ?? null);
        const newAsset = inside.find((asset) => !alertedNationalAssetsRef.current.has(asset.id));
        if (newAsset && nationalAssetAlert()) {
          for (const asset of inside) alertedNationalAssetsRef.current.add(asset.id);
        }
      } catch {
        if (!cancelled) {
          setNearbyNationalAlert(null);
          setNearbyNationalAssets([]);
        }
      }
    }

    void refreshNationalAlert();
    const timer = window.setInterval(refreshNationalAlert, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [nationalAssetAlert, observerPosition, radius]);

  useEffect(() => {
    let cancelled = false;
    if (!enrichableAircraft.length) return;
    const prioritized = [...enrichableAircraft].sort((a, b) => {
      const aSelected = a.id === selected?.id ? 0 : 1;
      const bSelected = b.id === selected?.id ? 0 : 1;
      return aSelected - bSelected || a.distance - b.distance;
    });
    const pending = prioritized.filter((item) => enrichedInputSignaturesRef.current.get(item.id) !== enrichmentInputKey(item));

    function updateStatus() {
      const statuses = enrichableAircraft.map((item) => identityStatusByModeSRef.current.get(item.id.replace(/^~/, "").toUpperCase()) ?? "unknown");
      const complete = statuses.filter((status) => status === "complete").length;
      const partial = statuses.filter((status) => status === "partial").length;
      const unknown = statuses.length - complete - partial;
      setEnrichmentStatus(`${complete} identités complètes • ${partial} partielles • ${unknown} inconnues`);
    }

    if (!pending.length) {
      updateStatus();
      return;
    }

    async function refreshEnrichment() {
      setEnrichmentStatus(`Identification de ${pending.length} appareil${pending.length > 1 ? "s" : ""}…`);
      const aircraftById = new Map(enrichableAircraft.map((item) => [item.id.replace(/^~/, "").toUpperCase(), item]));
      for (let offset = 0; offset < pending.length; offset += 25) {
        const batch = pending.slice(offset, offset + 25);
        const payload = batch.map((item) => ({
          modeS: item.id,
          registration: item.registration,
          callsign: item.callsign,
          operator: item.operator,
          aircraftType: item.aircraftType,
          description: item.description,
          category: item.category,
          positionSource: item.positionSource,
          distanceKm: item.distance,
          learnedIdentity: readLearnedAircraftIdentity(item.id)
        }));
        const response = await fetch("/api/aviation/enriched-aircraft", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ aircraft: payload, selectedModeS: selected?.id ?? null })
        });
        const result = await response.json();
        if (!response.ok || !Array.isArray(result.enriched)) throw new Error(result.error ?? "Enrichissement indisponible");
        if (cancelled) return;
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
        rememberAircraftIdentities(enrichedItems);
        for (const item of enrichedItems) identityStatusByModeSRef.current.set(item.modeS, item.identityStatus);
        for (const item of batch) enrichedInputSignaturesRef.current.set(item.id, enrichmentInputKey(item));
        const now = new Date();
        const passageBucket = now.toISOString().slice(0, 13);
        recordObservations(enrichedItems.map((item) => {
          const live = aircraftById.get(item.modeS);
          const remarkableLabels = live ? detectRemarkable(live, item).map((remarkable) => remarkable.label) : [];
          return { id: `${item.modeS}:${passageBucket}`, modeS: item.modeS, callsign: item.callsignIcao ?? item.rawCallsign,
            registration: item.registration, observedAt: now.toISOString(), latitude: live?.latitude ?? 0, longitude: live?.longitude ?? 0,
            distanceKm: live?.distance ?? null, altitudeMeters: live?.barometricAltitude ?? null, operator: item.aircraftOperator,
            aircraftType: item.aircraftType, photoUrl: item.photo.url, departureAirport: item.departureAirport,
            arrivalAirport: item.arrivalAirport, routeConfidence: item.routeConfidence, routeSource: item.routeSource,
            remarkableLabels, positionSource: item.positionSource,
            observerLatitude: observerPosition?.[0] ?? null, observerLongitude: observerPosition?.[1] ?? null,
            observationSite: savedHome && observerPosition && distanceKm(savedHome, observerPosition) <= 0.5 ? "home" as const : "other" as const };
        }));
      }
      if (!cancelled) updateStatus();
    }

    void refreshEnrichment().catch(() => { if (!cancelled) setEnrichmentStatus("Identification momentanément indisponible • données directes conservées"); });
    return () => { cancelled = true; };
  // La signature évite de relancer l’enrichissement quand seules les positions changent.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrichmentSignature, selected?.id]);

  const identifiedOperator = selectedEnriched?.operator ?? selected?.operator ?? null;
  const weatherEligible = Boolean(selectedEnriched && routeCanUseAirportWeather(selectedEnriched.routeConfidence, selectedEnriched.departureAirport, selectedEnriched.arrivalAirport));
  const weatherRequestKey = weatherEligible && selectedEnriched?.departureAirport && selectedEnriched.arrivalAirport
    ? routeWeatherKey(selectedEnriched.departureAirport, selectedEnriched.arrivalAirport)
    : null;
  const weatherQuery = weatherEligible && selectedEnriched?.departureAirport && selectedEnriched.arrivalAirport
    ? new URLSearchParams({
        originLat: String(selectedEnriched.departureAirport.latitude),
        originLon: String(selectedEnriched.departureAirport.longitude),
        destinationLat: String(selectedEnriched.arrivalAirport.latitude),
        destinationLon: String(selectedEnriched.arrivalAirport.longitude)
      }).toString()
    : null;

  useEffect(() => {
    let cancelled = false;
    if (!weatherRequestKey || !weatherQuery) {
      setRouteWeather({ key: null, status: "idle", origin: null, destination: null });
      return;
    }
    setRouteWeather({ key: weatherRequestKey, status: "loading", origin: null, destination: null });
    fetch(`/api/route-weather?${weatherQuery}`, { cache: "no-store" })
      .then(async (response) => ({ ok: response.ok, payload: await response.json() }))
      .then(({ ok, payload }) => {
        if (cancelled) return;
        if (!ok || !payload.originWeather || !payload.destinationWeather) {
          setRouteWeather({ key: weatherRequestKey, status: "unavailable", origin: null, destination: null });
          return;
        }
        setRouteWeather({ key: weatherRequestKey, status: "ready", origin: payload.originWeather as AirportWeather, destination: payload.destinationWeather as AirportWeather });
      })
      .catch(() => { if (!cancelled) setRouteWeather({ key: weatherRequestKey, status: "unavailable", origin: null, destination: null }); });
    return () => { cancelled = true; };
  }, [weatherQuery, weatherRequestKey]);

  const route: FlightRoute | null = selectedEnriched?.departureAirport && selectedEnriched.arrivalAirport ? {
    origin: selectedEnriched.departureAirport,
    destination: selectedEnriched.arrivalAirport,
    originWeather: routeWeather.key === weatherRequestKey && routeWeather.status === "ready" ? routeWeather.origin : null,
    destinationWeather: routeWeather.key === weatherRequestKey && routeWeather.status === "ready" ? routeWeather.destination : null
  } : null;

  const visibleAircraft = useMemo(() => {
    return flightOnly ? aircraft.filter((item) => !item.onGround) : aircraft;
  }, [aircraft, flightOnly]);

  const mapPoints = useMemo(
    () => {
      const matchesObserver = (point: [number, number] | null) => Boolean(point && observerPosition
        && Math.abs(point[0] - observerPosition[0]) < 0.00001
        && Math.abs(point[1] - observerPosition[1]) < 0.00001);
      return [
      ...(observerPosition ? [{
        id: `reference-${observerReference}`,
        lat: observerPosition[0],
        lon: observerPosition[1],
        name: observerReference === "home" ? "HOME" : observerReference === "manual" ? "Point d’observation choisi" : "MOI — position GPS",
        detail: observerStatus,
        color: "#3aa7ff",
        category: observerReference === "home" ? "home" : observerReference === "moi" ? "moi" : "location"
      }] : []),
      ...(savedHome && observerReference !== "home" && !matchesObserver(savedHome) ? [{
        id: "reference-home",
        lat: savedHome[0],
        lon: savedHome[1],
        name: "HOME",
        detail: "Position fixe enregistrée",
        category: "home"
      }] : []),
      ...(position && observerReference !== "moi" && !matchesObserver(position) ? [{
        id: "reference-moi",
        lat: position[0],
        lon: position[1],
        name: "MOI",
        detail: positionStatus,
        category: "moi"
      }] : []),
      ...nearbyNationalAssets.filter((asset) => !visibleAircraft.some((item) => item.id === asset.id)).map((asset) => ({
        id: asset.id,
        lat: asset.latitude,
        lon: asset.longitude,
        name: asset.callsign,
        detail: `${asset.badge} • ${asset.distanceKm.toFixed(1)} km`,
        color: "#ff4fd8",
        category: nationalMarkerCategory(asset.badge),
        heading: asset.track ?? null
      })),
      ...visibleAircraft.slice(0, 100).map((item) => {
        const visual = aircraftVisual(item);
        const enriched = enrichedByModeS[item.id.replace(/^~/, "").toUpperCase()];
        const remarkable = detectRemarkable(item, enriched);
        return {
          id: item.id,
          lat: item.latitude,
          lon: item.longitude,
          name: enriched?.flightNumberIata ?? enriched?.callsignIcao ?? enriched?.rawCallsign ?? item.callsign ?? item.registration ?? "ADS-B",
          detail: [enriched?.operator ?? item.operator, enriched?.aircraftType ?? item.aircraftType].filter(Boolean).join(" • "),
          color: remarkable.length ? "#ff4fd8" : item.id === selected?.id ? "#00b7ff" : visual.color,
          category: remarkable.length ? "remarkable" : visual.category,
          heading: item.trueTrack
        };
      })
    ];
    },
    [observerPosition, observerReference, observerStatus, savedHome, position, positionStatus, enrichedByModeS, nearbyNationalAssets, selected, visibleAircraft]
  );

  const mapTrails = useMemo(
    () => {
      if (!showTrails || !selected) return [];
      const trail = buildSelectedTrail({
        observedPositions: trailsRef.current[selected.id] ?? [],
        currentPosition: [selected.latitude, selected.longitude],
        trackDegrees: selected.trueTrack,
        speedMetersPerSecond: selected.velocity
      });
      return trail ? [{ id: selected.id, ...trail, color: "#00a8ff", selected: true }] : [];
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, trailsVersion, showTrails]
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
        verticalRateMetersPerSecond: item.verticalRate,
        positionTimestampMs: aircraftPositionTimestamp(item.lastPositionAt)
      },
      history: passageHistoryRef.current.get(item.id),
      observer: observerPosition,
      gpsAccuracyMeters: observerAccuracy,
      nowMs
    })]));
  // Le compteur rend les nouveaux échantillons du store visibles sans dupliquer l’historique dans l’état React.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aircraft, observerPosition, observerAccuracy, passageHistoryVersion]);
  const homePassageById = useMemo(() => {
    if (!savedHome) return {} as Record<string, PassageAnalysis>;
    const nowMs = Date.now();
    return Object.fromEntries(aircraft.map((item) => [item.id, analyzeAircraftPassage({
      aircraft: {
        modeS: item.id,
        latitude: item.latitude,
        longitude: item.longitude,
        altitudeMeters: item.barometricAltitude,
        groundSpeedMetersPerSecond: item.velocity,
        trackDegrees: item.trueTrack,
        verticalRateMetersPerSecond: item.verticalRate,
        positionTimestampMs: aircraftPositionTimestamp(item.lastPositionAt)
      },
      history: passageHistoryRef.current.get(item.id),
      observer: savedHome,
      nowMs
    })]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aircraft, savedHome, passageHistoryVersion]);
  const approach = selected ? passageById[selected.id] ?? null : null;
  const homeApproach = selected ? homePassageById[selected.id] ?? null : null;
  const bearing = selected && observerPosition ? bearingName(observerPosition, [selected.latitude, selected.longitude]) : null;
  const estimatedElevation = selected && selected.barometricAltitude !== null && selected.distance > 0
    ? Math.max(0, Math.min(90, (Math.atan2(selected.barometricAltitude, selected.distance * 1000) * 180) / Math.PI))
    : null;
  const selectedHomeDistance = selected && savedHome ? distanceKm(savedHome, [selected.latitude, selected.longitude]) : null;
  const selectedMoiDistance = selected && position ? distanceKm(position, [selected.latitude, selected.longitude]) : null;
  const selectedPassageCount = selected ? countRecordedPassages(selected.id) : 0;

  const watchNow = useMemo(() => {
    const reference = savedHome ?? observerPosition;
    if (!reference) return [];
    const nationalIds = new Set(nearbyNationalAssets.map((asset) => asset.id));
    return rankWatchNow(aircraft.map((item) => {
      const visual = aircraftVisual(item);
      const remarkable = detectRemarkable(item, enrichedByModeS[item.id.replace(/^~/, "").toUpperCase()]);
      return {
        id: item.id,
        callsign: enrichedByModeS[item.id.replace(/^~/, "").toUpperCase()]?.flightNumberIata ?? item.callsign,
        distanceKm: distanceKm(reference, [item.latitude, item.longitude]),
        altitudeMeters: item.barometricAltitude,
        onGround: item.onGround,
        isNational: nationalIds.has(item.id),
        isRemarkable: remarkable.length > 0,
        isMilitary: visual.category === "military",
        isRare: ["glider", "airship", "balloon", "autogyro"].includes(visual.category),
        estimatedSecondsToHomePassage: savedHome ? homePassageById[item.id]?.estimatedSecondsToClosest ?? null : null
      };
    }), 3);
  }, [aircraft, enrichedByModeS, homePassageById, nearbyNationalAssets, observerPosition, savedHome]);

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

  const remarkableById = useMemo(() => Object.fromEntries(aircraft.map((item) => [item.id, detectRemarkable(item, enrichmentFor(item))])),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [aircraft, enrichedByModeS]);
  const trafficDensity = aircraft.length < 5 ? "faible" : aircraft.length < 15 ? "modéré" : "dense";
  const remarkableCount = Object.values(remarkableById).filter((items) => items.length > 0).length;
  const funClosest = useMemo(() => {
    const regular = aircraft[0] ?? null;
    const national = nearbyNationalAssets[0] ?? null;
    if (!national) return regular;
    if (!regular || national.distanceKm < regular.distance) return nationalAssetToAircraft(national);
    return regular;
  }, [aircraft, nearbyNationalAssets]);
  const funClosestEnriched = funClosest ? enrichedByModeS[funClosest.id.replace(/^~/, "").toUpperCase()] ?? null : null;
  const funClosestLabel = funClosestEnriched?.flightNumberIata ?? funClosestEnriched?.callsignIcao ?? funClosest?.callsign ?? "Prochaine cible";
  const funClosestBearing = funClosest && observerPosition ? bearingName(observerPosition, [funClosest.latitude, funClosest.longitude]) : null;
  const skyMoodInput = {
    aircraftCount: aircraft.length,
    closestDistanceKm: funClosest?.distance ?? null,
    remarkableCount,
    nationalCount: nearbyNationalAssets.length
  };
  const skyMood = buildSpotterSkyMood(skyMoodInput);
  const funScore = spotterChallengeScore(skyMoodInput);
  const funRouteReady = Boolean(route);
  const funClosePassage = Boolean(funClosest && funClosest.distance <= 10);
  const funSpecialSeen = remarkableCount > 0 || nearbyNationalAssets.length > 0;

  function selectAircraft(id: string) {
    setSelectedId(id);
    setManualSelection(true);
    setSelectionDismissed(false);
    const target = aircraft.find((item) => item.id === id);
    const nationalTarget = nearbyNationalAssets.find((item) => item.id === id);
    if (nationalTarget) {
      const current = trailsRef.current[id] ?? [];
      const next = appendObservedPosition(current, [nationalTarget.latitude, nationalTarget.longitude]);
      if (next !== current) {
        trailsRef.current[id] = next;
        setTrailsVersion((value) => value + 1);
      }
    }
    const focusTarget = target ?? nationalTarget;
    if (focusTarget) focusMap([focusTarget.latitude, focusTarget.longitude], 11);
  }

  function closeAircraftSelection() {
    setSelectionDismissed(true);
    setSelectedId(null);
    setManualSelection(true);
    setCameraMode("free");
  }

  function focusMap(center: [number, number], zoom = 12) {
    cameraCommandIdRef.current += 1;
    setCameraMode("focus");
    setCameraCommand({ id: cameraCommandIdRef.current, center, zoom });
  }

  function followSelectedAircraft() {
    if (!selected) return;
    cameraCommandIdRef.current += 1;
    setCameraCommand({ id: cameraCommandIdRef.current, center: [selected.latitude, selected.longitude], zoom: 11 });
    setCameraMode("follow");
  }

  function toggleFavorite(id: string) {
    setFavoriteIds((current) => {
      const next = current.includes(id) ? current.filter((value) => value !== id) : [...current, id];
      safeWriteJson(getBrowserStorage("local"), XAVPAC_STORAGE_KEYS.favorites, next);
      return next;
    });
  }

  function openAircraftView() {
    setSelectionDismissed(false);
    setManualSelection(false);
    void unlockAudio();
    flushSync(() => setShowAircraftView(true));
    void enterFullscreenIfAvailable(aircraftViewRef.current).then((mode) => {
      nativeFullscreenRef.current = mode === "native";
    });
  }

  function closeAircraftView() {
    setShowAircraftView(false);
    nativeFullscreenRef.current = false;
    void exitFullscreenIfActive();
  }

  function toggleAircraftViewSounds() {
    void setSoundEnabled(!soundsEnabled);
  }

  function toggleSpotterSounds() {
    void setSoundEnabled(soundsEnabled && soundsReady ? false : true);
  }

  function changeAlertRadius(next: AviationRadius) {
    setRadius(next);
    safeSetItem(getBrowserStorage("local"), XAVPAC_STORAGE_KEYS.aviationRadius, String(next));
  }

  function showFunRadar() {
    if (!observerPosition) return;
    tactileFeedback();
    focusMap(observerPosition, radius === 100 ? 8 : radius === 50 ? 9 : radius === 20 ? 10 : 11);
  }

  function selectFunClosest() {
    if (!funClosest) return;
    tactileFeedback([8, 35, 8]);
    selectAircraft(funClosest.id);
  }

  function openFunAircraftView() {
    tactileFeedback(14);
    openAircraftView();
  }

  function toggleFunSounds() {
    tactileFeedback();
    toggleSpotterSounds();
  }

  function enrichmentFor(item: LiveAircraft) {
    return enrichedByModeS[item.id.replace(/^~/, "").toUpperCase()] ?? null;
  }

  function setObserverPoint(point: [number, number], message: string, reference: ObserverReference = "manual") {
    setManualObserver(point);
    setReferencePreference(reference);
    setObserverCoordinates(`${point[0]}, ${point[1]}`);
    setObserverMessage(message);
    setSelectionDismissed(false);
    passageHistoryRef.current.clear();
    trailsRef.current = {};
    setPassageHistoryVersion((value) => value + 1);
    safeWriteJson(getBrowserStorage("session"), MANUAL_OBSERVER_KEY, { position: point, reference });
    focusMap(point);
  }

  function applyObserverCoordinates() {
    const values = observerCoordinates.split(/[;,\s]+/).map(Number).filter(Number.isFinite);
    if (values.length < 2 || values[0] < 41 || values[0] > 52 || values[1] < -6 || values[1] > 10) {
      setObserverMessage("Coordonnées invalides pour la France.");
      return;
    }
    setObserverPoint([values[0], values[1]], "Position corrigée avec vos coordonnées.");
  }

  async function searchObserverCommune() {
    if (!observerCommune.trim()) return;
    setObserverMessage("Recherche de l’adresse dans la Base Adresse Nationale…");
    try {
      const response = await fetch(`https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(observerCommune)}&index=address&limit=1`);
      const payload = await response.json();
      const result = payload.features?.[0];
      const coordinates = result?.geometry?.coordinates;
      if (!Array.isArray(coordinates) || !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) {
        setObserverMessage("Adresse introuvable dans la Base Adresse Nationale.");
        return;
      }
      setObserverPoint([coordinates[1], coordinates[0]], `${result.properties?.label ?? observerCommune} • source IGN/BAN`);
    } catch {
      setObserverMessage("Service officiel de recherche d’adresse momentanément indisponible.");
    }
  }

  function useGpsObserver() {
    setManualObserver(null);
    setReferencePreference("moi");
    setObserverMessage("Nouvelle demande GPS envoyée au navigateur.");
    setSelectionDismissed(false);
    passageHistoryRef.current.clear();
    trailsRef.current = {};
    setPassageHistoryVersion((value) => value + 1);
    safeRemoveItem(getBrowserStorage("session"), MANUAL_OBSERVER_KEY);
    retryGeolocation();
  }

  function saveCurrentHome() {
    safeWriteCoordinatePair(getBrowserStorage("local"), SAVED_HOME_KEY, XAVPAC_HOME.position);
    setSavedHome(XAVPAC_HOME.position);
    setObserverPoint(XAVPAC_HOME.position, `HOME fixe • ${XAVPAC_HOME.address}`, "home");
  }

  function useSavedHome() {
    if (savedHome) setObserverPoint(savedHome, "Position HOME utilisée volontairement.", "home");
  }

  return (
    <section className="flightwall-v61">
      <div ref={aircraftViewRef} className={`aircraft-view-shell${showAircraftView ? " open" : ""}`} aria-hidden={!showAircraftView}>
        {!selected && <AircraftStandbyView
          open={showAircraftView}
          rootRef={aircraftViewContentRef}
          observerLabel={observerReference === "home" ? "HOME" : observerReference === "moi" ? "MA POSITION" : "POINT CHOISI"}
          observerPosition={observerPosition}
          radiusKm={radius}
          sourceStatus={sourceStatus}
          soundsEnabled={soundsEnabled}
          onClose={closeAircraftView}
          onToggleSounds={toggleAircraftViewSounds}
        />}
        {selected && <AircraftView
          open={showAircraftView}
          rootRef={aircraftViewContentRef}
          aircraft={selected}
          enriched={selectedEnriched}
          operator={identifiedOperator}
          route={route}
          routeConfidence={selectedEnriched?.routeConfidence ?? "unavailable"}
          observerPosition={observerPosition}
          passage={approach}
          trail={mapTrails[0] ?? null}
          passageCount={selectedPassageCount}
          nationalAlert={nearbyNationalAlert}
          nationalAlertRadius={radius}
          soundsEnabled={soundsEnabled}
          favorite={favoriteIds.includes(selected.id)}
          onClose={closeAircraftView}
          onShowMap={closeAircraftView}
          onToggleSounds={toggleAircraftViewSounds}
          onToggleFavorite={() => toggleFavorite(selected.id)}
        />}
      </div>
      <div className="flightwall-commandbar panel">
        <div className="flightwall-actions">
          <button type="button" className={showTrails ? "fw-action active" : "fw-action"} onClick={() => setShowTrails((value) => !value)}>🛩️ Trajectoire sélectionnée</button>
          <button type="button" className={showCircle ? "fw-action active" : "fw-action"} onClick={() => setShowCircle((value) => !value)}>🎯 Cercles</button>
          <button type="button" className={showFilters ? "fw-action active" : "fw-action"} onClick={() => setShowFilters((value) => !value)}>🔽 Filtres</button>
          <button type="button" className="fw-action">🔔 Remarquables <b>{Object.values(remarkableById).filter((items) => items.length).length}</b></button>
          <button type="button" className="fw-action" onClick={openAircraftView}>▣ Mode avion</button>
        </div>
        <div className="fw-live-summary"><span className={observerPosition ? "live-dot" : "live-dot off"} /> {sourceStatus} • {enrichmentStatus}</div>
      </div>

      <div className="aviation-source-health panel" aria-label="Santé des sources Aviation">
        <span className={error ? "offline" : trafficUpdatedAt ? "available" : "degraded"}><b>ADS-B</b><strong>{error ? "INDISPONIBLE" : trafficUpdatedAt ? "LIVE" : "CONNEXION"}</strong><small>{compactFreshness(trafficUpdatedAt)}</small></span>
        <span className={observerReference === "moi" ? isLive ? "available" : "degraded" : "available"}><b>RÉFÉRENCE</b><strong>{observerReference === "moi" ? isLive ? "MOI GPS" : "MOI MÉMORISÉ" : observerReference === "home" ? "HOME" : "POINT CHOISI"}</strong><small>{observerReference === "moi" ? resolvedReference.usedLastValidGps ? "Dernière position GPS valide" : gpsQualityReason : observerReference === "home" ? referencePreference === "home" ? "HOME volontaire" : "HOME par défaut sur Mac / secours GPS" : "Référence manuelle"}</small></span>
        {providerHealth.filter((source) => ["adsbdb", "planespotters", "opensky"].includes(source.id)).map((source) => <span key={source.id} className={source.state}><b>{source.name}</b><strong>{source.state === "available" ? "DISPONIBLE" : source.state === "degraded" ? "DÉGRADÉ" : source.state === "disabled" ? "DÉSACTIVÉ" : "HORS LIGNE"}</strong><small>{compactFreshness(source.lastSuccess)}</small></span>)}
      </div>
      <div className="aviation-compact-summary panel" aria-label="Résumé XavPac Aviation">
        <strong>{aircraft.length} appareil{aircraft.length > 1 ? "s" : ""} autour {observerReference === "home" ? "de HOME" : "du point d’observation"}.</strong>
        <span>Trafic {trafficDensity}.{remarkableCount ? ` ${remarkableCount} appareil${remarkableCount > 1 ? "s" : ""} remarquable${remarkableCount > 1 ? "s" : ""}.` : " Aucun appareil remarquable confirmé."}</span>
        <span>{nearbyNationalAssets.length ? `🛟 ${nearbyNationalAssets.length} moyen${nearbyNationalAssets.length > 1 ? "s" : ""} ${nearbyNationalAssets.length > 1 ? "nationaux" : "national"} détecté${nearbyNationalAssets.length > 1 ? "s" : ""} dans la zone de ${radius} km.` : `Aucun moyen national détecté dans la zone de ${radius} km.`}</span>
      </div>

      <div className={`aviation-sound-console panel${soundsEnabled ? " enabled" : " disabled"}`} aria-label="Réglages des alertes sonores">
        <div className="aviation-sound-copy"><span>ALERTES SONORES</span><strong>{!soundsEnabled ? "SONS COUPÉS" : soundsReady ? "SONS PRÊTS" : "À INITIALISER"}</strong><small>Deux notes discrètes pour un changement d’avion • accord doux pour un moyen national.</small></div>
        <div className="aviation-sound-tests">
          <button type="button" className="sound-master" onClick={toggleSpotterSounds}>{!soundsEnabled ? "Activer les sons" : soundsReady ? "Couper les sons" : "Initialiser les sons"}</button>
          <button type="button" disabled={!soundsEnabled} onClick={() => void previewAircraftChange()}>Tester avion</button>
          <button type="button" disabled={!soundsEnabled} onClick={() => void previewNationalAsset()}>Tester moyen national</button>
        </div>
        <div className="aviation-alert-radius"><span>LE SON NATIONAL SE DÉCLENCHE UNIQUEMENT DANS</span><div>{AVIATION_RADIUS_OPTIONS.map((value) => <button type="button" key={value} className={radius === value ? "active" : ""} onClick={() => changeAlertRadius(value)}>{value} km</button>)}</div><small>Ce choix règle aussi le rayon de la carte et reste mémorisé sur ce Mac.</small></div>
      </div>

      <section className={`spotter-fun-panel panel ${skyMood.level}`} aria-label="Cockpit fun Spotter">
        <header><div><span>COCKPIT FUN</span><h2>Votre ciel, comme un petit jeu d’observation</h2></div><div className="spotter-fun-score"><small>SCORE LIVE</small><strong>{funScore}</strong><span>/ 99</span></div></header>
        <div className="spotter-fun-grid">
          <article className="spotter-sky-mood"><div className="spotter-radar-toy"><i /><span>{skyMood.icon}</span></div><div><small>AMBIANCE DU CIEL</small><strong>{skyMood.label}</strong><p>{skyMood.message}</p></div></article>
          <button type="button" className="spotter-fun-target" disabled={!funClosest} onClick={selectFunClosest}><small>🎯 CIBLE LA PLUS PROCHE</small><strong>{funClosestLabel}</strong><span>{funClosest ? `${funClosest.distance.toFixed(1)} km • ${funClosestBearing?.label ?? "direction en attente"}` : "Aucun avion pour le moment"}</span><em>{funClosest ? "Afficher sur la carte →" : "Le radar continue de chercher"}</em></button>
          <article className="spotter-fun-bingo"><small>🏆 MINI-MISSION</small><strong>Le bingo du ciel</strong><div><span className={funClosePassage ? "done" : ""}>✓ Avion à moins de 10 km</span><span className={funRouteReady ? "done" : ""}>✓ Trajet identifié</span><span className={funSpecialSeen ? "done" : ""}>✓ Appareil spécial</span></div></article>
          <article className="spotter-fun-compass"><small>🧭 OÙ REGARDER ?</small><strong>{funClosestBearing?.label ?? "Patientez…"}</strong><div className="spotter-compass-dial" style={{ "--spotter-bearing": `${funClosestBearing?.bearing ?? 0}deg` } as CSSProperties}><i>➤</i></div><span>{funClosestBearing ? `${Math.round(funClosestBearing.bearing)}° depuis ${observerReference === "home" ? "HOME" : "votre position"}` : "Direction disponible dès le prochain signal"}</span></article>
        </div>
      </section>

      <nav className="spotter-touch-dock panel" aria-label="Raccourcis tactiles Spotter">
        <button type="button" disabled={!observerPosition} onClick={showFunRadar}><span>⌖</span><strong>Radar</strong><small>{radius} km</small></button>
        <button type="button" disabled={!funClosest} onClick={selectFunClosest}><span>🎯</span><strong>Plus proche</strong><small>{funClosest ? `${funClosest.distance.toFixed(1)} km` : "—"}</small></button>
        <button type="button" onClick={openFunAircraftView}><span>▣</span><strong>Vue avion</strong><small>{selected ? "Plein écran" : "Mode veille"}</small></button>
        <button type="button" className={soundsEnabled ? "active" : ""} onClick={toggleFunSounds} aria-pressed={soundsEnabled}><span>{soundsEnabled ? "🔊" : "🔇"}</span><strong>Son</strong><small>{soundsEnabled ? soundsReady ? "Prêt" : "À lancer" : "Coupé"}</small></button>
      </nav>

      {showFilters && (
        <div className="fw-filterbar panel">
          <button type="button" className={flightOnly ? "active" : ""} onClick={() => setFlightOnly(true)}>En vol uniquement</button>
          <button type="button" className={!flightOnly ? "active" : ""} onClick={() => setFlightOnly(false)}>Tous les appareils</button>
          <span>{favoriteIds.length} favori{favoriteIds.length > 1 ? "s" : ""}</span>
        </div>
      )}

      {((observerReference === "moi" && gpsError) || error) && <div className="aviation-warning-v5">{(observerReference === "moi" && gpsError) || error}</div>}
      {nearbyNationalAssets.length > 0 && <div className="aviation-national-alerts" aria-label="Moyens nationaux détectés">
        {nearbyNationalAssets.slice(0, 4).map((asset) => <button type="button" key={asset.id} onClick={() => selectAircraft(asset.id)} className={asset.id === selected?.id ? "selected" : ""}>
          <span>🛟 <b>{asset.badge}</b> • {asset.callsign} • {asset.distanceKm.toFixed(1)} km • dans votre zone de {radius} km • {asset.identification?.confidence === "confirmed" ? "Confirmé" : "Probable"}</span>
          <strong>{asset.id === selected?.id ? "Tracé affiché" : "Voir le tracé →"}</strong>
        </button>)}
      </div>}

      <div className={`aviation-location-panel panel ${observerPosition ? "ready" : "missing"}`}>
        <div className="aviation-location-state"><span>POSITION D’OBSERVATION • {observerReference === "home" ? "HOME" : observerReference === "moi" ? "MOI" : "POINT CHOISI"}</span><strong>{observerStatus}</strong><small>{observerPosition ? `${observerReference === "moi" ? gpsQualityReason : "Coordonnées définies volontairement"} • les distances sont calculées depuis cette référence.` : "Aucun trafic local n’est affiché tant que votre position n’est pas fiable."}</small>{savedHome && <em>📍 HOME enregistré • {savedHome[0].toFixed(5)} / {savedHome[1].toFixed(5)}</em>}</div>
        <div className="aviation-location-inputs">
          <label>Adresse ou commune <span><input value={observerCommune} onChange={(event) => setObserverCommune(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void searchObserverCommune(); } }} placeholder="Ex. 12 rue…, 01380 Bâgé-Dommartin" /><button type="button" onClick={() => void searchObserverCommune()}>Me placer</button></span></label>
          <label>Latitude, longitude <span><input value={observerCoordinates} onChange={(event) => setObserverCoordinates(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); applyObserverCoordinates(); } }} placeholder="46.306, 4.831" /><button type="button" onClick={applyObserverCoordinates}>Appliquer</button></span></label>
          <button type="button" className="aviation-gps-retry" onClick={useGpsObserver}>{observerReference === "moi" ? "Relancer le GPS" : "Reprendre MOI GPS"}</button>
          <button type="button" className="aviation-home-save" onClick={saveCurrentHome}>🏠 Revenir à mon adresse HOME</button>
          {savedHome && <button type="button" className="aviation-home-use" onClick={useSavedHome}>🏠 Aller à HOME</button>}
        </div>
        {observerMessage && <p>{observerMessage}</p>}
      </div>

      <div className="flightwall-main-grid">
        <div className="flightwall-left">
          <div className="flightwall-map-card panel">
            <div className="flightwall-map-stage">
              <StableMap
                  points={mapPoints}
                  center={observerPosition ?? FRANCE_OVERVIEW_CENTER}
                  radiusKm={radius}
                  showRadius={showCircle}
                  selectedId={selected?.id}
                  trails={mapTrails}
                  onSelect={selectAircraft}
                  mapVariant={mapStyle}
                  cameraMode={cameraMode}
                  cameraCommand={cameraCommand}
                  followTarget={cameraMode === "follow" && selected ? [selected.latitude, selected.longitude] : null}
                  onCameraModeChange={setCameraMode}
                />

              <div className="fw-map-style">
                <button className={mapStyle === "street" ? "active" : ""} onClick={() => setMapStyle("street")} type="button">Plan lisible</button>
                <button className={mapStyle === "satellite" ? "active" : ""} onClick={() => setMapStyle("satellite")} type="button">Satellite</button>
                <button className={mapStyle === "dark" ? "active" : ""} onClick={() => setMapStyle("dark")} type="button">Mode sombre</button>
              </div>

              <div className="fw-radius-selector">
                <span>CARTE + ALERTE</span>
                {AVIATION_RADIUS_OPTIONS.map((value) => (
                  <button type="button" key={value} className={radius === value ? "active" : ""} onClick={() => changeAlertRadius(value)}>{value} km</button>
                ))}
              </div>

              <div className="fw-map-counters">
                <div><span>✈️</span><strong>{aircraft.filter((item) => !item.onGround).length}</strong><small>En vol</small></div>
                <div><span>🎯</span><strong>{observerPosition ? aircraft.filter((item) => item.distance <= 20).length : "—"}</strong><small>À proximité</small></div>
                <div><span>🛬</span><strong>{aircraft.filter((item) => item.onGround).length}</strong><small>Au sol</small></div>
              </div>

              <div className="fw-camera-controls" aria-label="Contrôles de la carte">
                <span className={`fw-camera-mode ${cameraMode}`}>{cameraMode === "free" ? "LIBRE" : cameraMode === "follow" ? "SUIVI" : "FOCUS"}</span>
                <button type="button" disabled={!position} title="Voir ma position GPS" onClick={() => position && focusMap(position)}>Moi</button>
                <button type="button" disabled={!savedHome} title="Voir HOME" onClick={() => savedHome && focusMap(savedHome)}>Home</button>
                <button type="button" title="Vue générale de la France" onClick={() => focusMap(FRANCE_OVERVIEW_CENTER, 6)}>France</button>
                <button type="button" disabled={!selected} className={cameraMode === "follow" ? "active" : ""} title="Suivre l’avion sélectionné" onClick={followSelectedAircraft}>Suivre</button>
              </div>

              {showTrails && selected && <div className={`fw-trail-status ${mapTrails[0]?.kind ?? "waiting"}`}>
                <strong>{mapTrails[0]?.kind === "observed" ? "TRACÉ ADS-B OBSERVÉ" : mapTrails[0]?.kind === "heading" ? "CAP ACTUEL" : "TRACÉ EN ATTENTE"}</strong>
                <small>{mapTrails[0]?.kind === "observed" ? `${mapTrails[0].positions.length} positions réelles` : mapTrails[0]?.kind === "heading" ? "Pointillé • historique en cours d’acquisition" : "Une nouvelle position est nécessaire"}</small>
              </div>}

            </div>
          </div>

          <article className="aviation-watch-now panel">
            <header><div><span>👀 À REGARDER MAINTENANT</span><strong>{savedHome ? "Priorités autour de HOME" : "Priorités autour du point d’observation"}</strong></div><small>Maximum 3 • classement déterministe</small></header>
            <div>
              {watchNow.map((item, index) => <button type="button" key={item.id} onClick={() => selectAircraft(item.id)}><b>{index + 1}</b><strong>{item.callsign}</strong><span>{item.reason}</span><em>{item.distanceKm.toFixed(1)} km</em></button>)}
              {!watchNow.length && <p>Aucun appareil prioritaire à signaler actuellement.</p>}
            </div>
          </article>

          <div className="flightwall-bottom-grid">
            <article className="fw-data-card panel fw-radar-card">
              <header><strong>Mini radar local</strong><span>Rayon {radius} km</span></header>
              <div className="fw-radar-layout">
                <div className="mini-radar fw-large-radar">
                  <span className="radar-axis horizontal" /><span className="radar-axis vertical" />
                  <span className="radar-circle one" /><span className="radar-circle two" /><span className="radar-circle three" /><span className="radar-center" />
                  {observerPosition && aircraft.slice(0, 22).map((item) => <button type="button" key={item.id} className={item.id === selected?.id ? "radar-blip selected" : "radar-blip"} style={radarCoordinates(observerPosition, item, radius)} onClick={() => selectAircraft(item.id)} title={item.callsign} />)}
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
                    <em>{observerPosition ? `${item.distance.toFixed(1)} km` : "Distance —"}<small>{passage?.status === "approaching" ? passage.estimatedSecondsToClosest === null ? "En rapprochement" : `Passage estimé dans ${formatDuration(passage.estimatedSecondsToClosest)}` : passage?.status === "closest" ? "Au plus près" : passage?.status === "receding" ? "En éloignement" : passage?.status === "non-convergent" ? "Non convergent" : "Analyse en attente"} • {routeQualifiers[enriched?.routeConfidence ?? "unavailable"]}</small></em>
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
                <div><span className="fw-kicker">AVION SÉLECTIONNÉ</span><div className="fw-title-line"><h2>{selectedEnriched?.flightNumberIata ?? selectedEnriched?.callsignIcao ?? selected.callsign}</h2><button type="button" className={favoriteIds.includes(selected.id) ? "fw-favorite active" : "fw-favorite"} onClick={() => toggleFavorite(selected.id)} aria-label="Ajouter aux favoris">☆</button><button type="button" className="fw-close-selection" onClick={closeAircraftSelection} aria-label="Fermer la sélection et masquer la trajectoire">×</button></div>{selectedEnriched?.identityStatus === "unknown" && <span className="aviation-unknown-identity">APPAREIL NON IDENTIFIÉ</span>}<OperatorBrand className="fw-airline-brand" name={identifiedOperator} logoUrl={selectedEnriched?.logo} /><p>{selectedEnriched?.aircraftType ?? selected.aircraftType ?? selected.description ?? "Type non disponible"}</p><button type="button" className="fw-aircraft-view-launch" onClick={openAircraftView}>▣ Ouvrir la Vue avion</button></div>
                <AircraftPhoto className="fw-aircraft-photo" identityKey={selected.id} photoUrl={selectedEnriched?.photo.url} isExact={selectedEnriched?.photo.kind === "exact"} label={selectedEnriched?.photo.label} source={selectedEnriched?.photo.source} photographer={selectedEnriched?.photo.photographer} aircraftType={selectedEnriched?.aircraftType ?? selected.aircraftType} description={selected.description} operator={identifiedOperator} category={selected.category} loading={!selectedEnriched} />
              </div>

              <div className="fw-identity-grid">
                <div><span>Immatriculation</span><strong>{selectedEnriched?.registration ?? selected.registration ?? "—"}</strong></div>
                <div><span>Type</span><strong>{selectedEnriched?.aircraftType ?? selected.aircraftType ?? "—"}</strong></div>
                <div><span>Mode S</span><strong>{selected.id.toUpperCase()}</strong></div>
                <div><span>Distance HOME</span><strong>{selectedHomeDistance === null ? "HOME non défini" : `${selectedHomeDistance.toFixed(1)} km`}</strong></div>
                <div><span>Distance MOI</span><strong>{selectedMoiDistance === null ? "MOI indisponible" : `${selectedMoiDistance.toFixed(1)} km`}</strong></div>
                <div><span>Passages enregistrés</span><strong>{selectedPassageCount}</strong></div>
              </div>

              <div className={`fw-passage-card passage-${approach?.status ?? "unavailable"}`}>
                <div className="fw-passage-summary"><span>Passage au plus près de ma position</span><h3>{passageTitle(approach)}</h3><p>{passageDetail(approach)}</p></div>
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
                  <div><span>Altitude estimée au passage</span><strong>{approach?.estimatedAltitudeAtClosestMeters === null || approach?.estimatedAltitudeAtClosestMeters === undefined ? "Non déterminée" : `≈ ${Math.round(approach.estimatedAltitudeAtClosestMeters).toLocaleString("fr-FR")} m`}</strong></div>
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

              {savedHome && <div className={`fw-home-passage-strip passage-${homeApproach?.status ?? "unavailable"}`}>
                <div><span>🏠 PASSAGE PRÈS DE HOME</span><strong>{passageTitle(homeApproach)}</strong><small>Calcul distinct de MOI • données ADS-B et trajectoire disponibles</small></div>
                <div><span>Distance actuelle HOME</span><strong>{homeApproach?.currentDistanceKm === null || homeApproach?.currentDistanceKm === undefined ? "—" : `${homeApproach.currentDistanceKm.toFixed(1)} km`}</strong></div>
                <div><span>Minimum projeté</span><strong>{homeApproach?.estimatedMinimumDistanceKm === null || homeApproach?.estimatedMinimumDistanceKm === undefined ? "Non déterminé" : `≈ ${homeApproach.estimatedMinimumDistanceKm.toFixed(1)} km`}</strong></div>
                <div><span>ETA estimée</span><strong>{homeApproach?.estimatedSecondsToClosest === null || homeApproach?.estimatedSecondsToClosest === undefined ? "Non déterminée" : `≈ ${formatDuration(homeApproach.estimatedSecondsToClosest)}`}</strong></div>
              </div>}

              <div className="fw-look-grid">
                <div><span>Où regarder ?</span><strong>{bearing?.label ?? "—"}</strong></div>
                <div><span>Azimut estimé</span><strong>{bearing ? `≈ ${Math.round(bearing.bearing)}°` : "—"}</strong></div>
                <div><span>Angle d’élévation estimé</span><strong>{estimatedElevation === null ? "—" : `${Math.round(estimatedElevation)}°`}</strong></div>
                <div><span>Distance actuelle</span><strong>{observerPosition ? `${selected.distance.toFixed(1)} km` : "Non déterminée"}</strong></div>
                <div><span>Passage estimé</span><strong>{approach?.estimatedSecondsToClosest === null || approach?.estimatedSecondsToClosest === undefined ? "Non déterminé" : `≈ ${formatDuration(approach.estimatedSecondsToClosest)}`}</strong></div>
                <div><span>Vitesse sol</span><strong>{formatSpeedKnots(selected.velocity)}</strong></div>
                <small>Azimut, élévation et temps de passage sont des estimations recalculées à chaque position.</small>
              </div>

              <div className={route ? "fw-route-card" : "fw-route-card unavailable"}>
                <div><span>Départ</span><strong>{route?.origin.iata ?? route?.origin.icao ?? "?"}</strong><small>{route ? `${route.origin.municipality ?? "Non déterminé"} • ${route.origin.name ?? "Non déterminé"}` : "Non déterminé"}</small></div>
                <div className="fw-route-line">✈︎ <i /> ✈︎</div>
                <div><span>Arrivée</span><strong>{route?.destination.iata ?? route?.destination.icao ?? "?"}</strong><small>{route ? `${route.destination.municipality ?? "Non déterminé"} • ${route.destination.name ?? "Non déterminé"}` : "Non déterminé"}</small></div>
              </div>
              <div className={`fw-route-provenance ${selectedEnriched?.routeConfidence ?? "unavailable"}`}>{routeQualifiers[selectedEnriched?.routeConfidence ?? "unavailable"]} • {selectedEnriched?.routeSource ?? "aucune source"}</div>

              {remarkableById[selected.id]?.length > 0 && <div className="remarkable-card"><span>APPAREIL REMARQUABLE</span>{remarkableById[selected.id].map((item) => <div key={item.key}><strong>{item.icon} {item.label}</strong><small>{item.confidence === "confirmed" ? "Identification confirmée" : "Identification probable"} • {item.evidence}</small></div>)}</div>}

              <FlightMetrics metrics={[
                { label: "Altitude", value: formatFlightLevel(selected.barometricAltitude), detail: formatAltitude(selected.barometricAltitude) },
                { label: "Vitesse", value: formatSpeedKnots(selected.velocity), detail: formatSpeedKmh(selected.velocity) },
                { label: "Cap", value: selected.trueTrack === null ? "—" : `${Math.round(selected.trueTrack)}°`, detail: directionName(selected.trueTrack).split(" • ")[0] },
                { label: "Vertical", value: formatVertical(selected.verticalRate), detail: selected.onGround ? "Au sol" : (selected.verticalRate ?? 0) > 0.5 ? "Montée" : (selected.verticalRate ?? 0) < -0.5 ? "Descente" : "Palier" }
              ]} />

              <div className="fw-source-grid">
                <div><span>Source position</span><strong>{selected.feedSource ?? trafficSource}</strong></div>
                <div><span>Suivi</span><strong>ADS-B</strong></div>
                <div><span>Position ADS-B</span><strong>{formatFreshness(approach?.freshnessSeconds ?? null)}</strong></div>
                <div><span>Identification du vol</span><strong>{selectedEnriched?.flightNumberIata ? `${selectedEnriched.flightNumberIata} • numéro commercial IATA` : selectedEnriched?.callsignIcao ? `${selectedEnriched.callsignIcao} • callsign ICAO` : `${selected.callsign} • identifiant ADS-B`}</strong></div>
              </div>
              <div className="fw-provenance-card"><strong>Traçabilité du trajet</strong><span>Source : {selectedEnriched?.routeProvenance.source ?? "Aucune"}</span><span>Récupération : {selectedEnriched ? new Date(selectedEnriched.routeProvenance.retrievedAt).toLocaleString("fr-FR") : "—"}</span><span>Méthode : {selectedEnriched?.routeProvenance.method ?? "—"}</span><span>Fraîcheur : {selectedEnriched ? `${selectedEnriched.routeProvenance.freshnessSeconds} s` : "—"}</span></div>

              {route && weatherEligible && <div className={`fw-weather-strip route-only-weather ${routeWeather.status}`}>
                <header><div><span>MÉTÉO DU VOL</span><strong>Départ et arrivée uniquement</strong></div><small>Open-Meteo</small></header>
                {routeWeather.status === "ready" ? <div>
                  {([{ airport: route.origin, weather: route.originWeather }, { airport: route.destination, weather: route.destinationWeather }]).map(({ airport, weather }) => (
                    <article key={airport.icao ?? airport.name ?? airport.iata}><span>{airport.municipality ?? airport.name ?? "Aéroport"}</span><strong>{typeof weather?.temperature_2m === "number" ? `${Math.round(weather.temperature_2m)}°C` : "—"}</strong><small>{weatherCondition(weather?.weather_code)}</small><small>Vent {typeof weather?.wind_speed_10m === "number" ? `${Math.round(weather.wind_speed_10m)} kt` : "—"} • Rafales {typeof weather?.wind_gusts_10m === "number" ? `${Math.round(weather.wind_gusts_10m)} kt` : "—"}</small><small>Visibilité {weatherVisibility(weather?.visibility ?? null)} • Pression {typeof weather?.surface_pressure === "number" ? `${Math.round(weather.surface_pressure)} hPa` : "—"}</small><small>Nuages {typeof weather?.cloud_cover === "number" ? `${Math.round(weather.cloud_cover)} %` : "—"} • MAJ {weather?.time ? new Date(weather.time).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—"}</small></article>
                  ))}
                </div> : <p className="fw-weather-status">{routeWeather.status === "loading" ? "Chargement de la météo réelle des deux aéroports…" : "Météo des aéroports momentanément indisponible."}</p>}
              </div>}
            </>
          ) : (
            <div className="focus-empty"><span>✈</span><h2>{selectionDismissed ? "Sélection fermée" : "Aucun avion détecté"}</h2><p>{selectionDismissed ? `${aircraft.length} appareil${aircraft.length > 1 ? "s" : ""} reste${aircraft.length > 1 ? "nt" : ""} visible${aircraft.length > 1 ? "s" : ""} sur la carte. Touchez une silhouette pour afficher sa fiche et sa trajectoire.` : `Aucun appareil ADS-B reçu dans un rayon de ${radius} km.`}</p><small>{sourceStatus}</small></div>
          )}
        </aside>
      </div>

      <div className="flightwall-statusline"><span>Données en direct et temps réel • <a href="https://adsb.fi" target="_blank" rel="noreferrer">adsb.fi</a></span><span>Position : {observerStatus}</span><span><i className="live-dot" /> Prochaine actualisation : 10 s</span></div>
    </section>
  );
}
