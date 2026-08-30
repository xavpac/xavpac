import type { AirportIdentity, DataMethod, RouteConfidence } from "./types.ts";

export type RouteCandidate = {
  source: string;
  origin: AirportIdentity | null;
  destination: AirportIdentity | null;
  confidence: RouteConfidence;
  method: DataMethod;
  retrievedAt: string;
  priority?: number;
};

export type RouteResolution = {
  selected: RouteCandidate | null;
  candidates: RouteCandidate[];
};

const CONFIDENCE_SCORE: Record<RouteConfidence, number> = {
  confirmed: 4,
  probable: 3,
  inferred: 2,
  unavailable: 0
};

function airportCode(airport: AirportIdentity | null) {
  return airport?.icao?.trim().toUpperCase() || airport?.iata?.trim().toUpperCase() || null;
}

function isComplete(candidate: RouteCandidate) {
  return Boolean(airportCode(candidate.origin) && airportCode(candidate.destination));
}

export function resolveAircraftRoute(candidates: readonly RouteCandidate[]): RouteResolution {
  const normalized = candidates.filter((candidate) => candidate.source.trim());
  const selected = normalized
    .filter(isComplete)
    .sort((left, right) =>
      CONFIDENCE_SCORE[right.confidence] - CONFIDENCE_SCORE[left.confidence]
      || (right.priority ?? 0) - (left.priority ?? 0)
      || right.retrievedAt.localeCompare(left.retrievedAt)
    )[0] ?? null;
  return { selected, candidates: [...normalized] };
}
