"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveGeolocation } from "../hooks/useLiveGeolocation";
import { evaluateDroneFlight } from "../lib/droneDecision";
import { reportDataUpdate } from "../lib/buildInfo";
import { detectRemarkable } from "../lib/aviation/remarkable";
import { distanceKm } from "../lib/aviation/geometry";
import type { LiveAircraft } from "../lib/aviation/liveAircraft";
import type { SofiaNotam } from "../lib/aviation/sofiaNotams";
import { readNotamInFrench } from "../lib/aviation/notam";
import {
  assessRtba,
  rtbaMapDisplayStatus,
  RTBA_ACTIVATION_URL,
  RTBA_SOURCE_LABEL,
  RTBA_SOURCE_URL,
  RTBA_ZONES
} from "../lib/aviation/rtba";
import {
  aircraftPositionTimestamp,
  analyzeAircraftPassage,
  droneOperationalPriority,
  PassageHistoryStore,
  type PassageAnalysis
} from "../lib/aviation/passageTracker";
import { getBrowserStorage, parseStoredJson, safeGetItem, safeRemoveItem, safeWriteJson, XAVPAC_STORAGE_KEYS } from "../lib/safeStorage";
import { assessNotamForMission } from "../lib/drone/notamMission";
import { DRONE_TIME_ZONE, formatMissionLocal, normalizeStoredDroneMission, resolveMissionWindow } from "../lib/drone/mission";
import { evaluateRtbaMission, type RtbaActivationFeed } from "../lib/drone/rtbaSchedule";
import LightningMapPanel from "./LightningMapPanel";
import { XAVPAC_HOME } from "../config/home";
import { lightningAgeMinutes, summarizeLightning, type LightningFeed } from "../lib/weather/lightning";

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

type NearbyPlace = { id: string; name: string; icao: string | null; kind: "aerodrome" | "heliport"; latitude: number; longitude: number; distanceKm: number; bearing: number };
type AnalyzedDroneTraffic = LiveAircraft & { distance: number; passage: PassageAnalysis; isHelicopter: boolean; isRemarkable: boolean; priority: number };
type MissionReference = "moi" | "home" | "manual";
type OfficialNotam = SofiaNotam;

const FRANCE_OVERVIEW_CENTER: [number, number] = [46.603354, 1.888334];
const OFFICIAL_NOTAM_LIMIT = 2;
const RTBA_UNAVAILABLE_FEED: RtbaActivationFeed = {
  state: "unavailable",
  source: "SIA/AZBA officiel",
  publishedAt: null,
  retrievedAt: null,
  coverageStartsAt: null,
  coverageEndsAt: null,
  slots: null,
  message: "L’accès authentifié aux créneaux AZBA n’est pas configuré dans XavPac. Consultez la carte officielle."
};

function parisFormParts(epochMs = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DRONE_TIME_ZONE,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date(epochMs));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` };
}

function initialMissionForm() {
  const now = parisFormParts();
  const later = parisFormParts(Date.now() + 45 * 60_000);
  return { date: now.date, startTime: now.time, endTime: later.date === now.date ? later.time : "23:59" };
}

function formatNotamMoment(iso: string | null, fallback: string) {
  if (!iso) return fallback;
  const value = new Date(iso);
  if (!Number.isFinite(value.getTime())) return fallback;
  const local = value.toLocaleString("fr-FR", { timeZone: DRONE_TIME_ZONE, dateStyle: "short", timeStyle: "short" });
  const utc = value.toLocaleString("fr-FR", { timeZone: "UTC", dateStyle: "short", timeStyle: "short" });
  return `${local} heure locale • ${utc} UTC`;
}

function sourceAgeText(iso: string | null) {
  if (!iso) return "âge inconnu";
  const ageSeconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (!Number.isFinite(ageSeconds)) return "âge inconnu";
  if (ageSeconds < 60) return `il y a ${ageSeconds} s`;
  if (ageSeconds < 3600) return `il y a ${Math.round(ageSeconds / 60)} min`;
  return `il y a ${Math.round(ageSeconds / 3600)} h`;
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

function isHelicopter(item: LiveAircraft) {
  return /heli|rotor|h145|ec145|h135|ec135|as35|aw\d{3}|bell/i.test(`${item.aircraftType ?? ""} ${item.description ?? ""} ${item.category ?? ""}`);
}

function formatPassageDuration(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return "—";
  const rounded = Math.round(seconds);
  if (rounded < 60) return `${rounded} s`;
  const minutes = Math.floor(rounded / 60);
  return `${minutes} min ${String(rounded % 60).padStart(2, "0")} s`;
}

function dronePassageLabel(analysis: PassageAnalysis) {
  if (analysis.status === "stale") return "Position trop ancienne";
  if (analysis.status === "waiting") return "Analyse en attente";
  if (analysis.status === "approaching") return "En rapprochement";
  if (analysis.status === "closest") return "Au point le plus proche";
  if (analysis.status === "receding") return "En éloignement";
  if (analysis.status === "non-convergent") return "Trajectoire non convergente";
  if (analysis.status === "no-observer") return "Site non défini";
  return "Analyse insuffisante";
}

function freshnessText(seconds: number | null) {
  return seconds === null ? "inconnue" : `${Math.round(seconds)} s`;
}

function lightningAgeText(occurredAtUtc: string | null) {
  if (!occurredAtUtc) return "non déterminé";
  const minutes = Math.floor(lightningAgeMinutes({ occurredAtUtc }));
  if (minutes < 1) return "à l’instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  return `il y a ${Math.floor(minutes / 60)} h`;
}

export default function DronePanel() {
  const [mapMode, setMapMode] = useState<"official" | "map">("map");
  const { position, status: positionStatus, accuracy, altitude, timestamp, isLive, trackingEnabled, setTrackingEnabled, retryGeolocation, error: gpsError } = useLiveGeolocation();
  const [metar, setMetar] = useState<MetarReport | null>(null);
  const [metarStatus, setMetarStatus] = useState("Chargement de la météo locale…");
  const [traffic, setTraffic] = useState<LiveAircraft[]>([]);
  const [lastUpdated, setLastUpdated] = useState("—");
  const [manualPoint, setManualPoint] = useState<[number, number] | null>(null);
  const [missionReference, setMissionReference] = useState<MissionReference>("moi");
  const [savedHome, setSavedHome] = useState<[number, number] | null>(XAVPAC_HOME.position);
  const [requestedHeight, setRequestedHeight] = useState(60);
  const [missionNowMode, setMissionNowMode] = useState(true);
  const [missionDate, setMissionDate] = useState("");
  const [missionStartTime, setMissionStartTime] = useState("");
  const [missionEndTime, setMissionEndTime] = useState("");
  const [missionNowAnchorMs, setMissionNowAnchorMs] = useState(0);
  const [coordinateInput, setCoordinateInput] = useState("");
  const [commune, setCommune] = useState("");
  const [locationMessage, setLocationMessage] = useState("");
  const [nearbyPlaces, setNearbyPlaces] = useState<NearbyPlace[]>([]);
  const [notamText, setNotamText] = useState("");
  const [officialNotams, setOfficialNotams] = useState<OfficialNotam[]>([]);
  const [officialNotamStatus, setOfficialNotamStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [officialNotamMessage, setOfficialNotamMessage] = useState("Position requise pour interroger SOFIA.");
  const [officialNotamUpdatedAt, setOfficialNotamUpdatedAt] = useState<string | null>(null);
  const [lightningFeed, setLightningFeed] = useState<LightningFeed | null>(null);
  const [notamRefreshVersion, setNotamRefreshVersion] = useState(0);
  const [missionStorageReady, setMissionStorageReady] = useState(false);
  const passageHistoryRef = useRef(new PassageHistoryStore());
  const passageReferenceRef = useRef("gps");
  const [passageHistoryVersion, setPassageHistoryVersion] = useState(0);

  const selectedPosition = missionReference === "moi" ? position : manualPoint;
  const mapCenter = selectedPosition ?? FRANCE_OVERVIEW_CENTER;
  const notamLocationKey = selectedPosition ? `${selectedPosition[0].toFixed(3)}:${selectedPosition[1].toFixed(3)}` : "";
  const missionWindow = useMemo(() => missionStorageReady ? resolveMissionWindow({
    date: missionDate,
    startTime: missionStartTime,
    endTime: missionEndTime,
    nowMode: missionNowMode,
    nowMs: missionNowAnchorMs,
    nowDurationMinutes: 45
  }) : null, [missionDate, missionEndTime, missionNowAnchorMs, missionNowMode, missionStartTime, missionStorageReady]);

  useEffect(() => {
    if (!missionNowMode) return;
    const timer = window.setInterval(() => setMissionNowAnchorMs(Date.now()), 10 * 60_000);
    return () => window.clearInterval(timer);
  }, [missionNowMode]);

  useEffect(() => {
    safeWriteJson(getBrowserStorage("local"), XAVPAC_STORAGE_KEYS.savedHome, XAVPAC_HOME.position);
    setSavedHome(XAVPAC_HOME.position);
    const session = getBrowserStorage("session");
    const rawMission = safeGetItem(session, XAVPAC_STORAGE_KEYS.droneMission);
    const storedMission = normalizeStoredDroneMission(parseStoredJson(rawMission));
    if (storedMission) {
      setMissionReference(storedMission.reference);
      setManualPoint(storedMission.reference === "moi" ? null : storedMission.point);
      setRequestedHeight(storedMission.heightMeters);
      setMissionNowMode(storedMission.nowMode);
      setMissionDate(storedMission.date);
      setMissionStartTime(storedMission.startTime);
      setMissionEndTime(storedMission.endTime);
      if (storedMission.reference !== "moi") setLocationMessage("MISSION conservée pendant votre navigation.");
    } else {
      if (rawMission !== null) safeRemoveItem(session, XAVPAC_STORAGE_KEYS.droneMission);
      setMissionReference("home");
      setManualPoint(XAVPAC_HOME.position);
      setLocationMessage(`MISSION = HOME • ${XAVPAC_HOME.address}`);
      const defaults = initialMissionForm();
      setMissionDate(defaults.date);
      setMissionStartTime(defaults.startTime);
      setMissionEndTime(defaults.endTime);
    }
    setMissionNowAnchorMs(Date.now());
    setMissionStorageReady(true);
  }, []);

  useEffect(() => {
    if (!missionStorageReady) return;
    safeWriteJson(getBrowserStorage("session"), XAVPAC_STORAGE_KEYS.droneMission, {
      reference: missionReference,
      point: missionReference === "moi" ? null : manualPoint,
      heightMeters: requestedHeight,
      nowMode: missionNowMode,
      date: missionDate,
      startTime: missionStartTime,
      endTime: missionEndTime
    });
  }, [manualPoint, missionDate, missionEndTime, missionNowMode, missionReference, missionStartTime, missionStorageReady, requestedHeight]);

  useEffect(() => {
    const reference = selectedPosition ? `${missionReference}:${selectedPosition[0].toFixed(5)}:${selectedPosition[1].toFixed(5)}` : missionReference;
    if (reference === passageReferenceRef.current) return;
    passageReferenceRef.current = reference;
    passageHistoryRef.current.clear();
    setPassageHistoryVersion((value) => value + 1);
  }, [missionReference, selectedPosition]);

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
    if (!selectedPosition) {
      setLightningFeed(null);
      return;
    }
    async function loadLightning() {
      const parameters = new URLSearchParams({
        lat: String(selectedPosition?.[0]),
        lon: String(selectedPosition?.[1]),
        radiusKm: "50",
        from: new Date(Date.now() - 60 * 60_000).toISOString()
      });
      try {
        const response = await fetch(`/api/lightning?${parameters}`, { cache: "no-store" });
        const payload = await response.json() as LightningFeed;
        if (!cancelled) setLightningFeed(payload);
      } catch {
        if (!cancelled) setLightningFeed({ status: "unavailable", source: null, retrievedAt: new Date().toISOString(), availableSince: null, impacts: [], message: "DONNÉES FOUDRE NON DISPONIBLES" });
      }
    }
    loadLightning();
    const timer = window.setInterval(loadLightning, 60_000);
    return () => { cancelled = true; window.clearInterval(timer); };
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
    const activeMissionWindow = missionWindow;
    if (!notamLocationKey || !activeMissionWindow) {
      setOfficialNotams([]);
      setOfficialNotamStatus("idle");
      setOfficialNotamMessage(!notamLocationKey ? "Position requise pour interroger SOFIA." : "Créneau de mission invalide.");
      setOfficialNotamUpdatedAt(null);
      return;
    }
    const missionStartIso = activeMissionWindow.startIso;
    const missionEndIso = activeMissionWindow.endIso;
    const [latitude, longitude] = notamLocationKey.split(":").map(Number);
    let cancelled = false;
    let controller = new AbortController();

    async function loadOfficialNotams() {
      controller.abort();
      controller = new AbortController();
      setOfficialNotamStatus("loading");
      setOfficialNotamMessage("Recherche officielle autour du point…");
      try {
        const query = new URLSearchParams({ lat: String(latitude), lon: String(longitude), start: missionStartIso, end: missionEndIso });
        const response = await fetch(`/api/notams?${query}`, { cache: "no-store", signal: controller.signal });
        const payload = await response.json();
        if (cancelled) return;
        if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Recherche SOFIA indisponible.");
        const nextNotams = Array.isArray(payload.notams) ? payload.notams as OfficialNotam[] : [];
        setOfficialNotams(nextNotams);
        setOfficialNotamStatus("success");
        setOfficialNotamMessage(nextNotams.length
          ? `${nextNotams.length} NOTAM officiel${nextNotams.length === 1 ? "" : "s"} reçu${nextNotams.length === 1 ? "" : "s"} — les ${Math.min(OFFICIAL_NOTAM_LIMIT, nextNotams.length)} plus proche${Math.min(OFFICIAL_NOTAM_LIMIT, nextNotams.length) === 1 ? "" : "s"} sont affiché${Math.min(OFFICIAL_NOTAM_LIMIT, nextNotams.length) === 1 ? "" : "s"}.`
          : "Aucun NOTAM retourné par SOFIA pour cette recherche.");
        setOfficialNotamUpdatedAt(typeof payload.queriedAt === "string" ? payload.queriedAt : new Date().toISOString());
      } catch (error) {
        if (cancelled || error instanceof Error && error.name === "AbortError") return;
        setOfficialNotams([]);
        setOfficialNotamStatus("error");
        setOfficialNotamMessage(error instanceof Error ? error.message : "Recherche SOFIA indisponible.");
      }
    }

    loadOfficialNotams();
    const timer = window.setInterval(loadOfficialNotams, 10 * 60 * 1000);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [notamLocationKey, missionWindow, notamRefreshVersion]);

  useEffect(() => {
    let cancelled = false;
    const observer = selectedPosition;
    if (!observer) {
      setTraffic([]);
      return;
    }
    const observerCoordinates: [number, number] = [observer[0], observer[1]];
    async function loadTraffic() {
      try {
        const response = await fetch(`/api/aircraft?lat=${observerCoordinates[0]}&lon=${observerCoordinates[1]}&radius=100`, { cache: "no-store" });
        const payload = await response.json();
        if (!cancelled) {
          const receivedAtMs = Date.now();
          const nextTraffic: LiveAircraft[] = Array.isArray(payload.aircraft) ? payload.aircraft : [];
          setTraffic(nextTraffic);
          let historyChanged = false;
          for (const item of nextTraffic) {
            historyChanged = passageHistoryRef.current.record({
              modeS: item.id,
              latitude: item.latitude,
              longitude: item.longitude,
              altitudeMeters: item.barometricAltitude,
              groundSpeedMetersPerSecond: item.velocity,
              trackDegrees: item.trueTrack,
              positionTimestampMs: aircraftPositionTimestamp(item.lastPositionAt),
              observer: observerCoordinates,
              observerTimestampMs: missionReference === "moi" ? timestamp : receivedAtMs
            }) || historyChanged;
          }
          if (historyChanged) setPassageHistoryVersion((value) => value + 1);
        }
      } catch { if (!cancelled) setTraffic([]); }
    }
    loadTraffic(); const timer = window.setInterval(loadTraffic, 15000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [selectedPosition, missionReference, timestamp]);

  const nearbyTraffic = useMemo<AnalyzedDroneTraffic[]>(() => {
    if (!selectedPosition) return [];
    const nowMs = Date.now();
    return traffic.map((item) => {
      const passage = analyzeAircraftPassage({
        aircraft: {
          modeS: item.id,
          latitude: item.latitude,
          longitude: item.longitude,
          altitudeMeters: item.barometricAltitude,
          groundSpeedMetersPerSecond: item.velocity,
          verticalRateMetersPerSecond: item.verticalRate,
          trackDegrees: item.trueTrack,
          positionTimestampMs: aircraftPositionTimestamp(item.lastPositionAt)
        },
        history: passageHistoryRef.current.get(item.id),
        observer: selectedPosition,
        gpsAccuracyMeters: missionReference === "moi" ? accuracy : null,
        nowMs
      });
      const helicopter = isHelicopter(item);
      const remarkable = detectRemarkable(item).length > 0;
      return {
        ...item,
        distance: distanceKm(selectedPosition, [item.latitude, item.longitude]),
        passage,
        isHelicopter: helicopter,
        isRemarkable: remarkable,
        priority: droneOperationalPriority({ analysis: passage, altitudeMeters: item.barometricAltitude, isHelicopter: helicopter, isRemarkable: remarkable })
      };
    }).sort((a, b) => a.priority - b.priority || a.distance - b.distance);
  // Le compteur publie les nouveaux points du store Mode-S auprès du calcul mémorisé.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPosition, missionReference, accuracy, traffic, passageHistoryVersion]);
  const alertTraffic = nearbyTraffic.filter((item) => {
    const projectedDistance = item.passage.estimatedMinimumDistanceKm ?? item.distance;
    const operationallySensitive = (item.barometricAltitude ?? Infinity) <= 1500 || item.isHelicopter || item.isRemarkable;
    return ["approaching", "closest"].includes(item.passage.status) && projectedDistance <= 5 && operationallySensitive;
  });
  const relevantTraffic = nearbyTraffic.filter((item) => item.priority < 6 || item.distance <= 20).slice(0, 8);

  const rtbaAssessment = useMemo(
    () => selectedPosition ? assessRtba(selectedPosition, requestedHeight) : null,
    [requestedHeight, selectedPosition]
  );
  const containingZones = useMemo(() => rtbaAssessment?.matches ?? [], [rtbaAssessment]);
  const rtbaMapZones = useMemo(
    () => RTBA_ZONES.map((zone) => ({ ...zone, status: rtbaMapDisplayStatus(zone.id, rtbaAssessment) })),
    [rtbaAssessment]
  );
  const notamReading = useMemo(() => readNotamInFrench(notamText), [notamText]);
  const rtbaMissionStatus = useMemo(() => missionWindow
    ? evaluateRtbaMission(rtbaAssessment, RTBA_UNAVAILABLE_FEED, missionWindow.startMs, missionWindow.endMs)
    : evaluateRtbaMission(rtbaAssessment, RTBA_UNAVAILABLE_FEED, 0, 0), [missionWindow, rtbaAssessment]);
  const notamAssessments = useMemo(() => new Map(officialNotams.map((notam) => [notam.id, missionWindow
    ? assessNotamForMission(notam, missionWindow.startMs, missionWindow.endMs, requestedHeight)
    : null])), [missionWindow, officialNotams, requestedHeight]);
  const directNotams = officialNotams.filter((notam) => notamAssessments.get(notam.id)?.level === "direct");
  const rtbaDataConfirmed = !["unconfirmed", "outside-local"].includes(rtbaMissionStatus.code);

  const decision = useMemo(() => evaluateDroneFlight({
    hasPosition: Boolean(selectedPosition),
    zones: containingZones.map((zone) => ({
      name: zone.id,
      containsPoint: zone.affectsRequestedHeight,
      status: rtbaMissionStatus.severity === "blocking" ? "active" as const : rtbaDataConfirmed ? "inactive" as const : "unknown" as const
    })),
    aerodromeDistanceKm: nearbyPlaces.find((place) => place.kind === "aerodrome")?.distanceKm ?? null,
    requestedHeightM: requestedHeight,
    weatherAvailable: Boolean(metar),
    flightCategory: metar?.flightCategory,
    gustKnots: metar?.wgst ?? metar?.wspd,
    visibilityKm: typeof metar?.visib === "number" ? metar.visib * 1.60934 : null,
    restrictionsChecked: false,
    nearbyAircraftCount: alertTraffic.length,
    directNotamCount: directNotams.length,
    criticalDataAvailable: Boolean(missionWindow && officialNotamStatus === "success" && rtbaDataConfirmed)
  }), [alertTraffic.length, containingZones, directNotams.length, metar, missionWindow, nearbyPlaces, officialNotamStatus, requestedHeight, rtbaDataConfirmed, rtbaMissionStatus.severity, selectedPosition]);

  const ceilingMeters = useMemo(() => {
    const layers = metar?.clouds?.filter((cloud) => ["BKN", "OVC", "VV"].includes(cloud.cover ?? "") && typeof cloud.base === "number") ?? [];
    return layers.length ? Math.min(...layers.map((cloud) => (cloud.base ?? 0) * 0.3048)) : null;
  }, [metar]);

  const nearestAerodrome = nearbyPlaces.find((place) => place.kind === "aerodrome") ?? null;
  const nearestHeliport = nearbyPlaces.find((place) => place.kind === "heliport") ?? null;
  const weatherBlocking = (metar?.wgst ?? metar?.wspd ?? 0) >= 35 || (typeof metar?.visib === "number" && metar.visib * 1.60934 < 1.5);
  const lightningSummary = selectedPosition && lightningFeed?.status === "available"
    ? summarizeLightning(lightningFeed.impacts, selectedPosition, 30)
    : null;
  const checklist = [
    { label: "Position", state: selectedPosition ? "Conforme" : "À vérifier", detail: selectedPosition ? "Point d’analyse défini" : "GPS ou point manuel requis" },
    { label: "RTBA / espaces", state: rtbaMissionStatus.severity === "blocking" ? "Bloquant" : rtbaMissionStatus.severity === "clear" ? "Conforme" : "À vérifier", detail: rtbaMissionStatus.label },
    { label: "NOTAM", state: directNotams.length ? "Bloquant" : officialNotamStatus === "success" ? "Conforme" : "À vérifier", detail: officialNotamStatus === "loading" ? "Recherche SOFIA en cours" : officialNotamStatus === "success" ? directNotams.length ? `${directNotams.length} impact direct mission` : `${officialNotams.length} NOTAM analysé${officialNotams.length === 1 ? "" : "s"}` : officialNotamStatus === "error" ? "SOFIA temporairement indisponible" : notamReading ? "Lecture française disponible — original prioritaire" : "Position requise" },
    { label: "Météo", state: !metar ? "À vérifier" : weatherBlocking ? "Bloquant" : "Conforme", detail: metar ? "Prévision au point reçue" : "Donnée absente" },
    { label: "Foudre", state: lightningFeed?.status === "available" ? "Conforme" : "À vérifier", detail: lightningFeed?.status === "available" ? "Impacts structurés reçus" : "Données structurées indisponibles" },
    { label: "Hauteur", state: requestedHeight > 120 ? "Bloquant" : "Conforme", detail: requestedHeight > 120 ? "Hauteur supérieure à 120 m" : "Hauteur demandée ≤ 120 m" },
    { label: "Autorisation", state: "À vérifier", detail: "À confirmer par le télépilote" },
    { label: "Sécurité", state: decision.level === "forbidden" ? "Bloquant" : "À vérifier", detail: alertTraffic.length ? "Trafic proche détecté" : "Surveillance continue nécessaire" }
  ] as const;
  const attentionCount = checklist.filter((item) => item.state !== "Conforme").length;

  const message = !selectedPosition
    ? "Position GPS indisponible : recherchez une commune, saisissez des coordonnées ou cliquez sur la carte."
    : rtbaMissionStatus.severity === "blocking"
      ? rtbaMissionStatus.detail
      : rtbaAssessment?.level === "inside-volume"
      ? "Le point et la hauteur demandée intersectent un volume RTBA publié. Le statut d’activation officiel doit être confirmé."
      : rtbaAssessment?.level === "below-floor"
        ? "Le point est dans une emprise RTBA horizontale, mais la hauteur demandée reste sous son plancher publié."
        : "Analyse géographique effectuée. Les activations, NOTAM et autres restrictions officielles restent à vérifier.";

  const rtbaSummary = !rtbaAssessment
    ? "POSITION REQUISE"
    : rtbaAssessment.level === "inside-volume"
      ? "DANS UN VOLUME RTBA PUBLIÉ"
      : rtbaAssessment.level === "below-floor"
        ? "SOUS LE PLANCHER RTBA PUBLIÉ"
        : rtbaAssessment.level === "outside-local"
          ? "HORS DES CONTOURS LF-R45 LOCAUX"
          : "COUVERTURE RTBA LOCALE INSUFFISANTE";

  const mapPoints = [
    ...(selectedPosition ? [{
        id: "mission",
        lat: selectedPosition[0],
        lon: selectedPosition[1],
        name: "MISSION",
        detail: missionReference === "home" ? "Mission placée à HOME" : missionReference === "moi" ? "Mission placée sur MOI" : "Point de mission choisi manuellement",
        category: "mission"
      }] : []),
    ...(position && missionReference !== "moi" ? [{ id: "moi", lat: position[0], lon: position[1], name: "MOI", detail: positionStatus, category: "moi" }] : []),
    ...(savedHome && missionReference !== "home" ? [{ id: "saved-home", lat: savedHome[0], lon: savedHome[1], name: "HOME", detail: "Position fixe enregistrée", category: "home" }] : []),
    ...nearbyPlaces.map((place) => ({ id: place.id, lat: place.latitude, lon: place.longitude, name: place.icao ?? place.name, detail: `${place.kind === "heliport" ? "Héliport" : "Aérodrome"} • ${place.name} • ${place.distanceKm.toFixed(1)} km`, category: "aerodrome" })),
    ...nearbyTraffic.map((item) => ({ id:`traffic-${item.id}`, lat:item.latitude, lon:item.longitude, name:item.callsign, detail:`${dronePassageLabel(item.passage)} • ${item.distance.toFixed(1)} km • Alt. ${item.barometricAltitude === null ? "Non déterminée" : `${Math.round(item.barometricAltitude)} m`} • donnée ${freshnessText(item.passage.freshnessSeconds)}`, category:item.isHelicopter ? "helicopter" : "aircraft", heading:item.trueTrack }))
  ];

  function applyCoordinates() {
    const values = coordinateInput.split(/[;,\s]+/).map(Number).filter(Number.isFinite);
    if (values.length < 2 || values[0] < 41 || values[0] > 52 || values[1] < -6 || values[1] > 10) { setLocationMessage("Coordonnées invalides pour la France."); return; }
    setManualPoint([values[0], values[1]]); setMissionReference("manual"); setLocationMessage("Point MISSION appliqué."); setMapMode("map");
  }

  async function searchCommune() {
    if (!commune.trim()) return;
    try {
      const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(commune)}&count=5&language=fr&countryCode=FR`);
      const payload = await response.json(); const result = payload.results?.[0];
      if (!result) { setLocationMessage("Commune introuvable."); return; }
      setManualPoint([result.latitude, result.longitude]); setMissionReference("manual"); setLocationMessage(`MISSION : ${result.name}${result.admin1 ? ` — ${result.admin1}` : ""}`); setMapMode("map");
    } catch { setLocationMessage("Recherche de commune indisponible."); }
  }

  function useNowMission() {
    const defaults = initialMissionForm();
    setMissionDate(defaults.date);
    setMissionStartTime(defaults.startTime);
    setMissionEndTime(defaults.endTime);
    setMissionNowAnchorMs(Date.now());
    setMissionNowMode(true);
  }

  return (
    <div className="drone-panel-flow">
      <section className="hero drone-hero-v4">
        <div>
          <span className="eyebrow">ASSISTANT TÉLÉPILOTE — FRANCE</span>
          <h1>Analyse opérationnelle nationale</h1>
          <p>GPS réel ou point manuel, trafic aérien, météo exacte et contrôles réglementaires.</p>
        </div>
        <div className={`drone-decision-status ${decision.level}`}>
          <span>{decision.level === "possible" ? "🟢" : decision.level === "forbidden" ? "🔴" : decision.level === "insufficient" ? "⚪" : "🟠"}</span>
          <div><strong>{decision.label}</strong><small>Mise à jour {lastUpdated}</small></div>
        </div>
      </section>

      <section className="panel drone-mission-planner">
        <header>
          <div><span className="eyebrow">MISSION DRONE</span><h2>{requestedHeight} m • {missionWindow ? missionWindow.isNow ? "Maintenant" : `${formatMissionLocal(missionWindow.startMs)} → ${formatMissionLocal(missionWindow.endMs)}` : "Créneau invalide"}</h2></div>
          <div className="drone-mission-mode"><button type="button" className={missionNowMode ? "active" : ""} onClick={useNowMission}>MAINTENANT</button><button type="button" className={!missionNowMode ? "active" : ""} onClick={() => setMissionNowMode(false)}>PLANIFIER</button></div>
        </header>
        <div className="drone-mission-fields">
          <label>Date<input type="date" value={missionDate} onChange={(event) => { setMissionDate(event.target.value); setMissionNowMode(false); }} /></label>
          <label>Début<input type="time" value={missionStartTime} onChange={(event) => { setMissionStartTime(event.target.value); setMissionNowMode(false); }} /></label>
          <label>Fin<input type="time" value={missionEndTime} onChange={(event) => { setMissionEndTime(event.target.value); setMissionNowMode(false); }} /></label>
          <label>Hauteur<input type="number" min="0" max="500" value={requestedHeight} onChange={(event) => setRequestedHeight(Math.max(0, Number(event.target.value) || 0))} /><span>m</span></label>
        </div>
        <div className="drone-mission-reference"><span>🎯</span><div><strong>Point MISSION • {selectedPosition ? missionReference === "home" ? "HOME" : missionReference === "moi" ? "MOI" : "POINT CHOISI" : "NON DÉFINI"}</strong><small>{selectedPosition ? `${selectedPosition[0].toFixed(5)} / ${selectedPosition[1].toFixed(5)}` : "Choisissez MOI, HOME, une commune, des coordonnées ou un point sur la carte."}</small></div></div>
        {!missionWindow && <p className="drone-mission-error">La fin doit être postérieure au début, avec une durée maximale de 12 heures.</p>}
        <footer>Heure principale : Europe/Paris. Les NOTAM conservent aussi leur heure UTC officielle.</footer>
      </section>

      <section className={`panel drone-decision-panel ${decision.level}`}>
        <div><span className="eyebrow">AIDE À LA DÉCISION</span><h2>{decision.label}</h2><p>{message}</p></div>
        <div className="drone-decision-why">
          <header><strong>{decision.level === "check" ? "Pourquoi des vérifications sont-elles nécessaires ?" : decision.level === "forbidden" ? "Quel élément bloquant a été détecté ?" : decision.level === "insufficient" ? "Quelles données manquent ?" : "Pourquoi aucun obstacle n’a été détecté ?"}</strong><span>{decision.checkReasons.length + decision.blockingReasons.length} point{decision.checkReasons.length + decision.blockingReasons.length === 1 ? "" : "s"} à traiter</span></header>
          {decision.blockingReasons.map((reason) => <p className="blocking" key={reason}><b>×</b><span>{reason}</span></p>)}
          {decision.checkReasons.map((reason) => <p className="checking" key={reason}><b>!</b><span>{reason}</span></p>)}
          {decision.positiveReasons.map((reason) => <p className="positive" key={reason}><b>✓</b><span>{reason}</span></p>)}
        </div>
        <div className="drone-decision-actions">
          <label>Hauteur demandée <input type="number" min="0" max="500" value={requestedHeight} onChange={(event) => setRequestedHeight(Math.max(0, Number(event.target.value) || 0))} /> m</label>
          <div className="drone-point-actions">
            <button type="button" disabled={!position} onClick={() => { setManualPoint(null); setMissionReference("moi"); }}>📍 MISSION = MOI</button>
            {savedHome && <button type="button" onClick={() => { setManualPoint(savedHome); setMissionReference("home"); }}>🏠 MISSION = HOME</button>}
            <small>{selectedPosition ? `${missionReference === "home" ? "HOME" : missionReference === "moi" ? "MOI" : "POINT CHOISI"} • ${selectedPosition[0].toFixed(5)} / ${selectedPosition[1].toFixed(5)}` : "Position de mission indisponible"}</small>
          </div>
        </div>
        <footer>Cette synthèse est une aide opérationnelle. Elle ne remplace pas la vérification réglementaire du télépilote (AZBA, NOTAM, SUP AIP, AIP et restrictions locales).</footer>
      </section>

      <section className="panel drone-briefing-v65">
        <header><div><span className="eyebrow">BRIEFING DRONE</span><h2>{attentionCount} élément{attentionCount === 1 ? "" : "s"} nécessite{attentionCount === 1 ? "" : "nt"} votre attention</h2></div><small>{missionWindow ? `${formatMissionLocal(missionWindow.startMs)} • ${missionWindow.durationMinutes} min` : "Créneau invalide"}</small></header>
        <div className="drone-briefing-grid">
          <article><span>📍 GPS</span><strong>{missionReference === "moi" ? positionStatus : "Coordonnées choisies"}</strong><small>{missionReference === "moi" && accuracy !== null ? `Précision ±${Math.round(accuracy)} m` : "Référence MISSION explicite"}</small></article>
          <article className={rtbaMissionStatus.severity}><span>📡 RTBA</span><strong>{rtbaMissionStatus.label}</strong><small>{rtbaMissionStatus.detail}</small></article>
          <article className={directNotams.length ? "blocking" : officialNotamStatus === "success" ? "clear" : "unconfirmed"}><span>📄 NOTAM</span><strong>{directNotams.length ? `${directNotams.length} impact direct` : officialNotamStatus === "success" ? `${officialNotams.length} analysé${officialNotams.length === 1 ? "" : "s"}` : "Données non confirmées"}</strong><small>{officialNotamMessage}</small></article>
          <article className={alertTraffic.length ? "check" : "clear"}><span>✈ TRAFIC</span><strong>{alertTraffic.length ? `${alertTraffic.length} rapprochement${alertTraffic.length === 1 ? "" : "s"} à surveiller` : "Aucun rapprochement préoccupant identifié"}</strong><small>Réception ADS-B non exhaustive</small></article>
          <article className={!metar ? "unconfirmed" : weatherBlocking ? "blocking" : "clear"}><span>🌬 MÉTÉO</span><strong>{metar ? `Vent ${metar.wspd ?? "—"} kt • rafales ${metar.wgst ?? "—"} kt` : "Donnée indisponible"}</strong><small>{metarStatus}</small></article>
          <article className={lightningSummary ? "clear" : "unconfirmed"}><span>⚡ FOUDRE • {missionReference === "home" ? "HOME" : "MISSION"}</span><strong>{lightningSummary ? lightningSummary.nearestKm === null ? "Aucun impact détecté dans les données disponibles" : `Plus proche ${lightningSummary.nearestKm.toFixed(1)} km • ${lightningSummary.count} impact${lightningSummary.count === 1 ? "" : "s"} / 30 min` : "DONNÉES FOUDRE NON DISPONIBLES"}</strong><small>{lightningSummary ? `Dernier : ${lightningAgeText(lightningSummary.latestAt)} • secteur ${lightningSummary.mainSector ?? "indéterminé"} • information opérationnelle uniquement` : "La carte ci-dessous reste indicative et ne constitue pas une autorisation de vol."}</small></article>
          <article className="unconfirmed"><span>☀ LUMIÈRE</span><strong>Calcul non disponible</strong><small>Ne pas déduire un horaire sans source solaire fiable</small></article>
        </div>
      </section>

      <LightningMapPanel position={selectedPosition} compact />

      <section className="drone-airspace-brief">
        <article className={`panel rtba-answer-card ${rtbaAssessment?.level ?? "no-position"}`}>
          <header>
            <div><span className="eyebrow">RÉPONSE RTBA AU POINT EXACT</span><h2>{rtbaSummary}</h2></div>
            <span className="rtba-answer-icon">{!rtbaAssessment ? "📍" : rtbaAssessment.level === "inside-volume" ? "⚠️" : rtbaAssessment.level === "below-floor" ? "↕️" : rtbaAssessment.level === "outside-local" ? "✓" : "?"}</span>
          </header>
          {selectedPosition ? <p className="rtba-coordinate">Point analysé : <strong>{selectedPosition[0].toFixed(6)} / {selectedPosition[1].toFixed(6)}</strong> • hauteur demandée : <strong>{requestedHeight} m</strong></p> : <p>Activez le GPS ou choisissez un point sur la carte.</p>}
          {containingZones.length > 0 ? (
            <div className="rtba-match-list">
              {containingZones.map((zone) => <div key={zone.id}>
                <strong>{zone.id} — {zone.name}</strong>
                <span>Contour horizontal : OUI</span>
                <span>Volume à {requestedHeight} m : {zone.affectsRequestedHeight ? "OUI — activation à vérifier" : `NON — plancher ${zone.floor}`}</span>
                <small>{zone.floor} → {zone.ceiling}</small>
              </div>)}
            </div>
          ) : rtbaAssessment ? (
            <p className="rtba-nearest">Tronçon analysé le plus proche : <strong>{rtbaAssessment.nearest[0]?.zone.id ?? "non déterminé"}</strong>{rtbaAssessment.nearest[0] ? ` à environ ${rtbaAssessment.nearest[0].distanceKm.toFixed(1)} km` : ""}.</p>
          ) : null}
          <div className={`rtba-activation-warning ${rtbaMissionStatus.severity}`}>
            <strong>{rtbaMissionStatus.label}</strong>
            <span>{rtbaMissionStatus.detail}</span>
            <small>{missionWindow ? `Mission analysée : ${formatMissionLocal(missionWindow.startMs)} → ${formatMissionLocal(missionWindow.endMs)}` : "Créneau MISSION invalide"}</small>
            <small>Source : {RTBA_UNAVAILABLE_FEED.source} • dernière récupération réussie : aucune • âge : non disponible</small>
          </div>
          <div className="rtba-official-actions">
            <a href={RTBA_ACTIVATION_URL} target="_blank" rel="noreferrer">Vérifier l’AZBA officiel maintenant ↗</a>
            <a href={RTBA_SOURCE_URL} target="_blank" rel="noreferrer">Voir les limites AIP ↗</a>
          </div>
          <footer>{RTBA_SOURCE_LABEL}. Activation : SIA/AZBA officiel, accès authentifié non configuré. Couverture géométrique embarquée : LF-R45 Bourgogne, Mâconnais et Jura. Hors de ce secteur, XavPac ne conclut jamais « hors RTBA ».</footer>
        </article>

        <article className="panel notam-fr-card">
          <header><div><span className="eyebrow">NOTAM OFFICIELS EN FRANÇAIS</span><h2>Récupération automatique au point</h2></div><a href="https://sofia-briefing.aviation-civile.gouv.fr/sofia/pages/notamsearcharea.html" target="_blank" rel="noreferrer">Ouvrir SOFIA Briefing ↗</a></header>
          <p>Dès que le point et le créneau MISSION sont valides, XavPac interroge SOFIA pour un vol VFR entre FL 000 et FL 010 dans un rayon de 10 NM, pendant la mission.</p>
          <div className={`notam-auto-status ${officialNotamStatus}`}>
            <span>{officialNotamStatus === "loading" ? "◌" : officialNotamStatus === "success" ? "●" : officialNotamStatus === "error" ? "!" : "📍"}</span>
            <div><strong>{officialNotamMessage}</strong><small>{officialNotamUpdatedAt ? `Source SOFIA-Briefing SIA/DSNA • récupérée le ${new Date(officialNotamUpdatedAt).toLocaleString("fr-FR", { timeZone: DRONE_TIME_ZONE, dateStyle: "short", timeStyle: "medium" })} • ${sourceAgeText(officialNotamUpdatedAt)}` : "Coordonnées et créneau envoyés uniquement au service officiel SIA/DSNA."}</small></div>
            <button type="button" disabled={!selectedPosition || officialNotamStatus === "loading"} onClick={() => setNotamRefreshVersion((value) => value + 1)}>Actualiser</button>
          </div>
          {officialNotams.length > 0 && <div className="official-notam-list">
            {officialNotams.slice(0, OFFICIAL_NOTAM_LIMIT).map((notam, index) => {
              const assessment = notamAssessments.get(notam.id);
              return <article key={notam.id} className={`mission-${assessment?.level ?? "information"}`}>
                <header><div><span>{notam.notamType} • {notam.category} • {notam.qCode}</span><strong>{notam.publicationReference}</strong></div><b>{assessment?.level === "direct" ? "🔴 IMPACT DIRECT MISSION" : assessment?.level === "relevant" ? "🟠 PERTINENT / PROCHE" : "⚪ INFORMATION"}</b></header>
                <div className="official-notam-rank">N° {index + 1} LE PLUS PROCHE • ✓ DONNÉE OFFICIELLE</div>
                <div className="official-notam-meta"><span>Zone A) : {notam.itemA}</span><span>{notam.impactsPoint ? "Point MISSION dans le périmètre — 0 km" : notam.distanceToAreaKm === null ? "Distance non déterminée" : `Bord du périmètre à ≈ ${notam.distanceToAreaKm.toFixed(1)} km`}</span><span>FL {String(notam.lowerFl ?? 0).padStart(3, "0")} → FL {String(notam.upperFl ?? 999).padStart(3, "0")}</span><span>Coordonnées : {notam.coordinates ?? "non indiquées"}{notam.radiusNm === null ? "" : ` • rayon ${notam.radiusNm} NM`}</span></div>
                <div className="notam-validity-v65"><span><b>Début local puis UTC</b>{formatNotamMoment(notam.startsAtIso, notam.startsAt)}</span><span><b>Fin locale puis UTC</b>{formatNotamMoment(notam.endsAtIso, notam.endsAt)}</span>{notam.schedule && <span><b>Horaires D)</b>{notam.schedule}</span>}</div>
                <div className="notam-provenance-v65"><span><b>Autorité de publication</b>{notam.publicationAuthority}</span><span><b>Bureau NOTAM / NOF</b>{notam.nof ?? "Non indiqué"}</span><span><b>FIR</b>{notam.fir ?? "Non indiquée"}</span><span><b>Activité</b>{notam.category}</span><span><b>Organisme à l’origine de la demande</b>{notam.requestingOrganization ?? "Non indiqué dans le NOTAM"}</span></div>
                <details className="notam-original-v65"><summary>1 — ORIGINAL OFFICIEL{notam.originalTextSource === "reconstructed" ? " • CHAMPS SOFIA RECONSTITUÉS" : ""}</summary><pre>{notam.originalText}</pre></details>
                <section className="notam-translation-v65"><span>{notam.translationSource === "sofia" ? "2 — TRADUCTION FRANÇAISE OFFICIELLE SOFIA" : "2 — 🇫🇷 TRADUCTION XAVPAC • NON OFFICIELLE"}</span><p>{notam.frenchText}</p></section>
                <section className={`notam-mission-explanation-v65 ${assessment?.level ?? "information"}`}><span>3 — EXPLICATION POUR LA MISSION</span>{assessment?.explanation.map((line) => <p key={line}>{line}</p>) ?? <p>Analyse impossible sans créneau MISSION valide.</p>}</section>
              </article>;
            })}
            {officialNotams.length > OFFICIAL_NOTAM_LIMIT && <small className="official-notam-more">Les deux NOTAM les plus proches sont affichés • ouvrez SOFIA pour consulter les {officialNotams.length - OFFICIAL_NOTAM_LIMIT} autre{officialNotams.length - OFFICIAL_NOTAM_LIMIT === 1 ? "" : "s"} dans le briefing officiel complet.</small>}
          </div>}
          {officialNotamStatus === "success" && officialNotams.length === 0 && <div className="notam-empty">Aucun NOTAM retourné par cette recherche officielle. Vérifiez néanmoins les SUP AIP, l’AZBA et les autres restrictions applicables.</div>}
          {officialNotamStatus === "error" && <div className="notam-source-error">SOFIA est indisponible depuis XavPac. Utilisez le lien officiel ci-dessus avant toute décision de vol.</div>}
          <details className="notam-manual-tool">
            <summary>Traduire manuellement un autre NOTAM</summary>
            <label htmlFor="notam-input">NOTAM original</label>
            <textarea id="notam-input" value={notamText} onChange={(event) => setNotamText(event.target.value)} rows={7} spellCheck={false} placeholder={'Ex. B) AAMMJJHHMM  C) AAMMJJHHMM\nE) TEXTE OPÉRATIONNEL DU NOTAM\nF) SFC  G) 1500FT AMSL'} />
            {notamReading && <div className="notam-reading">
              <div className="notam-facts">
                <p><span>Référence</span><strong>{notamReading.identifier ?? "non reconnue"}</strong></p>
                <p><span>Zone / FIR</span><strong>{notamReading.location ?? "non reconnue"}</strong></p>
                <p><span>Début</span><strong>{notamReading.startsAt ?? "non reconnu"}</strong></p>
                <p><span>Fin</span><strong>{notamReading.endsAt ?? "non reconnue"}</strong></p>
                <p><span>Plancher</span><strong>{notamReading.lowerLimit ?? "non reconnu"}</strong></p>
                <p><span>Plafond</span><strong>{notamReading.upperLimit ?? "non reconnu"}</strong></p>
              </div>
              {notamReading.schedule && <p className="notam-schedule"><span>Horaires</span><strong>{notamReading.schedule}</strong></p>}
              <div className="notam-french-text"><span>Lecture française du champ E)</span><strong>{notamReading.frenchText ?? "Contenu non reconnu"}</strong></div>
              <details><summary>Afficher le NOTAM original</summary><pre>{notamText}</pre></details>
              {notamReading.warnings.map((warning) => <small key={warning}>⚠️ {warning}</small>)}
            </div>}
          </details>
          <footer>Source : SOFIA-Briefing, SIA/DSNA. L’accès automatisé dépend de la disponibilité du service public. Le briefing officiel et le jugement du télépilote restent prioritaires.</footer>
        </article>
      </section>

      {alertTraffic.length > 0 && <section className="panel drone-traffic-alert"><strong>ALERTE — TRAFIC EN RAPPROCHEMENT DU SITE</strong>{alertTraffic.slice(0,3).map((item) => <p key={item.id}><b>{item.isHelicopter ? "🚁" : "✈️"} {item.callsign}</b> — {item.passage.estimatedSecondsToClosest === null ? "rapprochement mesuré" : `passage estimé dans ${formatPassageDuration(item.passage.estimatedSecondsToClosest)}`} {item.passage.estimatedMinimumDistanceKm === null ? "" : `à environ ${item.passage.estimatedMinimumDistanceKm.toFixed(1)} km`} • altitude {item.barometricAltitude === null ? "non déterminée" : `${Math.round(item.barometricAltitude)} m`} • donnée reçue il y a {freshnessText(item.passage.freshnessSeconds)}</p>)}<small>Aide à la vigilance uniquement : cette détection ADS-B n’est pas exhaustive.</small></section>}

      <section className="panel drone-passage-panel">
        <header><div><span className="eyebrow">TRAFIC CLASSÉ PAR PERTINENCE OPÉRATIONNELLE</span><h3>Rapprochement réel du site de mission</h3></div><small>{selectedPosition ? `Calcul MISSION depuis ${missionReference === "home" ? "HOME" : missionReference === "moi" ? "MOI" : "le point choisi"}` : "Position requise"}</small></header>
        <div className="drone-passage-list">
          {relevantTraffic.map((item) => <article key={item.id} className={`status-${item.passage.status}`}>
            <div className="drone-passage-identity"><b>{item.isHelicopter ? "🚁" : item.isRemarkable ? "◆" : "✈️"}</b><strong>{item.callsign}<small>{item.aircraftType ?? item.description ?? "Type non déterminé"} • priorité {item.priority}</small></strong></div>
            <div><span>Situation</span><strong>{dronePassageLabel(item.passage)}</strong></div>
            <div><span>Distance</span><strong>{item.passage.currentDistanceKm === null ? "—" : `${item.passage.currentDistanceKm.toFixed(1)} km`}</strong></div>
            <div><span>Altitude</span><strong>{item.barometricAltitude === null ? "—" : `${Math.round(item.barometricAltitude)} m`}</strong></div>
            <div><span>Passage estimé</span><strong>{item.passage.estimatedSecondsToClosest === null ? "—" : formatPassageDuration(item.passage.estimatedSecondsToClosest)}</strong></div>
            <div><span>Minimum estimé</span><strong>{item.passage.estimatedMinimumDistanceKm === null ? item.passage.status === "receding" && item.passage.observedMinimumDistanceKm !== null ? `${item.passage.observedMinimumDistanceKm.toFixed(1)} km observé` : "—" : `≈ ${item.passage.estimatedMinimumDistanceKm.toFixed(1)} km`}</strong></div>
            <div><span>Fraîcheur</span><strong>{freshnessText(item.passage.freshnessSeconds)}</strong></div>
          </article>)}
          {!relevantTraffic.length && <p className="drone-passage-empty">Aucun trafic pertinent analysable pour le moment.</p>}
        </div>
        {missionReference === "moi" && accuracy !== null && accuracy > 50 && <p className="drone-passage-gps-warning">Estimation limitée par une précision GPS de ± {Math.round(accuracy)} mètres.</p>}
        <footer>L’absence d’aéronef ADS-B détecté ne signifie jamais que l’espace aérien est libre. Maintenez l’observation visuelle et auditive et appliquez les procédures du télépilote.</footer>
      </section>

      <section className="drone-ops-overview">
        <article className="panel drone-synthesis">
          <header><span className="eyebrow">SYNTHÈSE OPÉRATIONNELLE</span><h3>Situation au point analysé</h3></header>
          <div>
            <p><span>Référence mission</span><strong>{selectedPosition ? missionReference === "home" ? "HOME fixe" : missionReference === "moi" ? "MOI — GPS" : "Point choisi" : "Non disponible"}</strong></p>
            <p><span>Précision</span><strong>{missionReference === "moi" && accuracy ? `±${Math.round(accuracy)} m` : missionReference === "moi" ? "Non déterminée" : "Coordonnées choisies"}</strong></p>
            <p><span>Altitude demandée</span><strong>{requestedHeight} m</strong></p>
            <p><span>Vent</span><strong>{metar?.wspd !== undefined ? `${metar.wspd} kt` : "Non déterminé"}</strong></p>
            <p><span>Rafales</span><strong>{metar?.wgst !== undefined ? `${metar.wgst} kt` : "Non déterminé"}</strong></p>
            <p><span>Visibilité</span><strong>{metar?.visib !== undefined ? visibilityText(metar.visib) : "Non déterminé"}</strong></p>
            <p><span>Plafond</span><strong>{ceilingMeters !== null ? `${Math.round(ceilingMeters)} m` : "Non déterminé"}</strong></p>
            <p><span>Pluie</span><strong>{metar?.wxString ? metar.wxString : "Non déterminé"}</strong></p>
            <p><span>RTBA / espaces</span><strong>{rtbaSummary}</strong></p>
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
              <h3>Ma position et zones RTBA</h3>
              <p className="muted">Ouverture directe sur votre position avec les contours RTBA publiés, le trafic et les aérodromes proches.</p>
            </div>
            <div className="rtba-mode-switch">
              <button type="button" className={mapMode === "official" ? "active" : ""} onClick={() => setMapMode("official")}>AZBA officiel live</button>
              <button type="button" className={mapMode === "map" ? "active" : ""} onClick={() => setMapMode("map")}>Carte locale</button>
            </div>
            <div className="drone-map-actions">
              <button type="button" disabled={!position} onClick={() => { setManualPoint(null); setMissionReference("moi"); setMapMode("map"); }}>MISSION = MOI</button>
              {savedHome && <button type="button" onClick={() => { setManualPoint(savedHome); setMissionReference("home"); setMapMode("map"); }}>MISSION = HOME</button>}
              <button type="button" onClick={() => position ? setTrackingEnabled(!trackingEnabled) : retryGeolocation()}>{position ? trackingEnabled ? "Désactiver suivi GPS" : "Activer suivi GPS" : "Relancer le GPS"}</button>
            </div>
          </div>

          <div className="drone-location-tools"><label>Commune <input value={commune} onChange={(event) => setCommune(event.target.value)} placeholder="Ex. Bordeaux" /><button type="button" onClick={searchCommune}>Rechercher</button></label><label>Latitude, longitude <input value={coordinateInput} onChange={(event) => setCoordinateInput(event.target.value)} placeholder="44.8378, -0.5792" /><button type="button" onClick={applyCoordinates}>Appliquer</button></label>{locationMessage && <small>{locationMessage}</small>}</div>

          {!selectedPosition && <div className="drone-location-warning"><span>📍</span><div><strong>La carte montre la France, pas votre position.</strong><small>Relancez le GPS, recherchez votre commune, saisissez vos coordonnées ou cliquez directement sur votre point exact.</small></div><button type="button" onClick={retryGeolocation}>Relancer le GPS</button></div>}

          {mapMode === "official" ? (
            <div className="azba-live-shell">
              <div className="azba-live-banner">
                <span><b>● OFFICIEL EN DIRECT</b> — rouge : active • bleu : inactive</span>
                <a href={RTBA_ACTIVATION_URL} target="_blank" rel="noreferrer">Ouvrir en plein écran ↗</a>
              </div>
              <iframe
                className="azba-live-frame"
                src={RTBA_ACTIVATION_URL}
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
                  zones={rtbaMapZones}
                  center={mapCenter}
                  zoom={selectedPosition ? 10 : 6}
                  mapVariant="layers"
                  showZoneLabels
                  onMapClick={(point) => { setManualPoint(point); setMissionReference("manual"); }}
                />
              </div>
              <div className="rtba-legend-v4">
                <span className="intersects-height">Rouge : votre point intersecte le volume à la hauteur demandée</span>
                <span className="below-floor">Bleu : votre point est sous le plancher publié</span>
                <span className="nearby">Jaune : zones les plus proches</span>
                <span className="unknown">Gris : autres contours publiés</span>
                <span className="official">Activation réelle et horaires : AZBA officiel live</span>
              </div>
            </>
          )}

          <div className="rtba-zone-list-v5"><article><span>📐</span><div><strong>RTBA LF-R45 AU POINT</strong><small>{rtbaSummary}. La géométrie et l’activation sont affichées séparément.</small></div></article><article><span>⚠️</span><div><strong>NOTAM</strong><small>Lecture française disponible plus haut après récupération du texte officiel sur SOFIA.</small></div></article><article><span>🛩️</span><div><strong>AUTRES ESPACES</strong><small>CTR, TMA, R, P, D, zones UAS et temporaires restent à contrôler sur les publications officielles.</small></div></article></div>
        </article>

        <aside className="drone-side-v4">
          <article className="panel rtba-check-card">
            <span className="eyebrow">GÉOLOCALISATION CONTINUE</span>
            <div className="check-row"><span>{isLive ? "🟢" : "🟠"}</span><div><strong>GPS</strong><small>{positionStatus}</small></div></div>
            <div className="check-row"><span>🎯</span><div><strong>MISSION • {missionReference === "home" ? "HOME" : missionReference === "moi" ? "MOI" : "POINT CHOISI"}</strong><small>{selectedPosition ? `${selectedPosition[0].toFixed(5)} / ${selectedPosition[1].toFixed(5)}` : "Position de mission indisponible"}</small></div></div>
            <div className="check-row"><span>🧭</span><div><strong>Latitude / longitude</strong><small>{selectedPosition ? `${selectedPosition[0].toFixed(6)} / ${selectedPosition[1].toFixed(6)}` : "Position indisponible"}</small></div></div>
            <div className="check-row"><span>📍</span><div><strong>MOI • précision / altitude GPS</strong><small>{position && accuracy ? `±${Math.round(accuracy)} m • ${altitude === null ? "altitude non disponible" : `${Math.round(altitude)} m`}` : "Position GPS indisponible"}</small></div></div>
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
    </div>
  );
}
