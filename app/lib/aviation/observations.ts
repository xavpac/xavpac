import type { AirportIdentity, EnrichedAircraft } from "./types";

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
};

const STORAGE_KEY = "xavpac-spotting-observations-v1";
const MAX_OBSERVATIONS = 2500;

export function readObservations(): SpottingObservation[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch { return []; }
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
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* stockage privé ou plein */ }
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
