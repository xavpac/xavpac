import type { AirportIdentity, EnrichedAircraft } from "./types";
import { getBrowserStorage, parseStoredJson, safeGetItem, safeWriteJson, XAVPAC_STORAGE_KEYS } from "../safeStorage.ts";

export type SpottingObservation = {
  id: string;
  modeS: string;
  callsign: string | null;
  registration: string | null;
  observedAt: string;
  latitude: number;
  longitude: number;
  distanceKm: number | null;
  altitudeMeters: number | null;
  operator: string | null;
  aircraftType: string | null;
  photoUrl: string;
  departureAirport: AirportIdentity | null;
  arrivalAirport: AirportIdentity | null;
  routeConfidence: EnrichedAircraft["routeConfidence"];
  routeSource?: string | null;
  remarkableLabels?: string[];
  positionSource?: string | null;
  observerLatitude?: number | null;
  observerLongitude?: number | null;
  observationSite?: "home" | "other";
};

const STORAGE_KEY = XAVPAC_STORAGE_KEYS.observations;
const MAX_OBSERVATIONS = 2500;

const routeConfidences = new Set<EnrichedAircraft["routeConfidence"]>(["confirmed", "probable", "inferred", "unavailable"]);

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function nullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeAirport(value: unknown): AirportIdentity | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const airport = value as Record<string, unknown>;
  return {
    name: nullableString(airport.name),
    municipality: nullableString(airport.municipality),
    iata: nullableString(airport.iata),
    icao: nullableString(airport.icao),
    latitude: nullableNumber(airport.latitude),
    longitude: nullableNumber(airport.longitude)
  };
}

export function normalizeObservation(value: unknown): SpottingObservation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const observation = value as Record<string, unknown>;
  const modeS = nullableString(observation.modeS);
  const observedAt = nullableString(observation.observedAt);
  const latitude = nullableNumber(observation.latitude);
  const longitude = nullableNumber(observation.longitude);
  if (!modeS || !observedAt || !Number.isFinite(Date.parse(observedAt)) || latitude === null || longitude === null) return null;
  const id = nullableString(observation.id) ?? `${modeS}:${observedAt}`;
  const routeConfidence = routeConfidences.has(observation.routeConfidence as EnrichedAircraft["routeConfidence"])
    ? observation.routeConfidence as EnrichedAircraft["routeConfidence"]
    : "unavailable";
  const remarkableLabels = Array.isArray(observation.remarkableLabels)
    ? observation.remarkableLabels.filter((item): item is string => typeof item === "string")
    : undefined;
  return {
    id,
    modeS,
    callsign: nullableString(observation.callsign),
    registration: nullableString(observation.registration),
    observedAt,
    latitude,
    longitude,
    distanceKm: nullableNumber(observation.distanceKm),
    altitudeMeters: nullableNumber(observation.altitudeMeters),
    operator: nullableString(observation.operator),
    aircraftType: nullableString(observation.aircraftType),
    photoUrl: nullableString(observation.photoUrl) ?? "",
    departureAirport: normalizeAirport(observation.departureAirport),
    arrivalAirport: normalizeAirport(observation.arrivalAirport),
    routeConfidence,
    routeSource: nullableString(observation.routeSource),
    remarkableLabels,
    positionSource: nullableString(observation.positionSource),
    observerLatitude: nullableNumber(observation.observerLatitude),
    observerLongitude: nullableNumber(observation.observerLongitude),
    observationSite: observation.observationSite === "home" ? "home" : "other"
  };
}

export function readObservations(): SpottingObservation[] {
  const value = parseStoredJson(safeGetItem(getBrowserStorage("local"), STORAGE_KEY));
  if (!Array.isArray(value)) return [];
  return value.map(normalizeObservation).filter((item): item is SpottingObservation => item !== null).slice(0, MAX_OBSERVATIONS);
}

export function countRecordedPassages(modeS: string, site?: SpottingObservation["observationSite"]) {
  const normalized = modeS.replace(/^~/, "").trim().toUpperCase();
  if (!normalized) return 0;
  return readObservations().filter((item) =>
    item.modeS.replace(/^~/, "").trim().toUpperCase() === normalized
    && (!site || item.observationSite === site)
  ).length;
}

export function recordObservations(values: SpottingObservation[]) {
  if (typeof window === "undefined" || !values.length) return;
  const current = readObservations();
  const byPassage = new Map(current.map((item) => [item.id, item]));
  for (const value of values) {
    const previous = byPassage.get(value.id);
    byPassage.set(value.id, previous && (previous.distanceKm ?? Infinity) <= (value.distanceKm ?? Infinity)
      ? { ...value, distanceKm: previous.distanceKm }
      : value);
  }
  const next = [...byPassage.values()].sort((a, b) => b.observedAt.localeCompare(a.observedAt)).slice(0, MAX_OBSERVATIONS);
  safeWriteJson(getBrowserStorage("local"), STORAGE_KEY, next);
}

export function deducedRoute(callsign: string | null) {
  if (!callsign) return null;
  const matching = readObservations().filter((item) => item.callsign === callsign && item.departureAirport && item.arrivalAirport);
  const counts = new Map<string, { count: number; departure: AirportIdentity; arrival: AirportIdentity; latest: string }>();
  for (const item of matching) {
    const departure = item.departureAirport;
    const arrival = item.arrivalAirport;
    if (!departure || !arrival) continue;
    const key = `${departure.icao ?? departure.iata}->${arrival.icao ?? arrival.iata}`;
    const current = counts.get(key);
    counts.set(key, { count: (current?.count ?? 0) + 1, departure, arrival, latest: current && current.latest > item.observedAt ? current.latest : item.observedAt });
  }
  const candidates = [...counts.values()].sort((a, b) => b.count - a.count || b.latest.localeCompare(a.latest));
  if (!candidates[0] || candidates[0].count < 3 || (candidates[1] && candidates[1].count === candidates[0].count)) return null;
  return candidates[0];
}
