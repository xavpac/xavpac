import { distanceKm } from "./geometry.ts";

export type RouteTimingEstimate = {
  progress: number | null;
  remainingKm: number | null;
  estimatedDepartureAt: Date | null;
  estimatedArrivalAt: Date | null;
};

type RouteTimingInput = {
  origin: [number, number] | null;
  destination: [number, number] | null;
  current: [number, number];
  velocityMetersPerSecond: number | null;
  onGround: boolean;
  nowMs: number | null;
};

export function estimateRouteTiming({ origin, destination, current, velocityMetersPerSecond, onGround, nowMs }: RouteTimingInput): RouteTimingEstimate {
  if (!origin || !destination) {
    return { progress: null, remainingKm: null, estimatedDepartureAt: null, estimatedArrivalAt: null };
  }

  const coveredKm = distanceKm(origin, current);
  const remainingKm = distanceKm(current, destination);
  const reconstructedRouteKm = coveredKm + remainingKm;
  const progress = reconstructedRouteKm > 1
    ? Math.max(0, Math.min(100, coveredKm / reconstructedRouteKm * 100))
    : null;

  const canEstimateTimes = nowMs !== null
    && !onGround
    && velocityMetersPerSecond !== null
    && Number.isFinite(velocityMetersPerSecond)
    && velocityMetersPerSecond > 20;

  if (!canEstimateTimes) {
    return { progress, remainingKm, estimatedDepartureAt: null, estimatedArrivalAt: null };
  }

  const millisecondsPerKilometer = 1_000_000 / velocityMetersPerSecond;
  return {
    progress,
    remainingKm,
    estimatedDepartureAt: coveredKm > 2 ? new Date(nowMs - coveredKm * millisecondsPerKilometer) : null,
    estimatedArrivalAt: remainingKm > 1 ? new Date(nowMs + remainingKm * millisecondsPerKilometer) : null
  };
}
