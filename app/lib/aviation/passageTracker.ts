import { bearingDegrees, distanceKm } from "./geometry.ts";

export const PASSAGE_HISTORY_MAX_AGE_MS = 8 * 60 * 1000;
export const PASSAGE_HISTORY_MAX_POINTS = 40;
export const AIRCRAFT_POSITION_STALE_AFTER_SECONDS = 45;
export const GPS_ACCURACY_WARNING_METERS = 50;
export const IMMEDIATE_PROXIMITY_KM = 5;
export const PASSAGE_PROGRESS_ZONE_KM = 10;
const PROJECTION_HORIZON_SECONDS = 30 * 60;
const TREND_THRESHOLD_METERS_PER_SECOND = 1.5;

export type PassageStatus =
  | "no-observer"
  | "stale"
  | "waiting"
  | "approaching"
  | "closest"
  | "receding"
  | "non-convergent"
  | "insufficient";

export type PassageObservationInput = {
  modeS: string;
  latitude: number;
  longitude: number;
  altitudeMeters: number | null;
  groundSpeedMetersPerSecond: number | null;
  trackDegrees: number | null;
  positionTimestampMs: number;
  observer: [number, number];
  observerTimestampMs?: number | null;
};

export type PassageObservation = PassageObservationInput & {
  modeS: string;
  distanceKm: number;
};

export type PassageAircraft = {
  modeS: string;
  latitude: number;
  longitude: number;
  altitudeMeters: number | null;
  groundSpeedMetersPerSecond: number | null;
  trackDegrees: number | null;
  positionTimestampMs: number;
};

export type PassageAnalysis = {
  status: PassageStatus;
  currentDistanceKm: number | null;
  distanceDeltaKm: number | null;
  closingSpeedMetersPerSecond: number | null;
  estimatedSecondsToClosest: number | null;
  estimatedMinimumDistanceKm: number | null;
  observedMinimumDistanceKm: number | null;
  secondsSinceClosest: number | null;
  passageSide: string | null;
  freshnessSeconds: number | null;
  progressPercent: number | null;
  gpsAccuracyLimited: boolean;
  gpsAccuracyMeters: number | null;
  historyPointCount: number;
};

function normalizedModeS(value: string) {
  return value.replace(/^~/, "").trim().toUpperCase();
}

function finite(value: number) {
  return Number.isFinite(value);
}

export class PassageHistoryStore {
  private readonly observations = new Map<string, PassageObservation[]>();

  private prune(referenceTimestampMs: number) {
    const cutoff = referenceTimestampMs - PASSAGE_HISTORY_MAX_AGE_MS;
    for (const [modeS, values] of this.observations) {
      const recent = values.filter((item) => item.positionTimestampMs >= cutoff);
      if (recent.length) this.observations.set(modeS, recent);
      else this.observations.delete(modeS);
    }
  }

  record(input: PassageObservationInput) {
    if (
      !input.modeS ||
      !finite(input.latitude) ||
      !finite(input.longitude) ||
      !finite(input.positionTimestampMs) ||
      !finite(input.observer[0]) ||
      !finite(input.observer[1])
    ) return false;

    this.prune(input.positionTimestampMs);
    const modeS = normalizedModeS(input.modeS);
    const current = this.observations.get(modeS) ?? [];
    const previous = current[current.length - 1];
    const samePosition = previous &&
      previous.positionTimestampMs === input.positionTimestampMs &&
      previous.latitude === input.latitude &&
      previous.longitude === input.longitude;
    if (samePosition) return false;
    if (previous && input.positionTimestampMs < previous.positionTimestampMs) return false;

    const observation: PassageObservation = {
      ...input,
      modeS,
      distanceKm: distanceKm(input.observer, [input.latitude, input.longitude])
    };
    const cutoff = input.positionTimestampMs - PASSAGE_HISTORY_MAX_AGE_MS;
    const next = [...current.filter((item) => item.positionTimestampMs >= cutoff), observation]
      .slice(-PASSAGE_HISTORY_MAX_POINTS);
    this.observations.set(modeS, next);
    return true;
  }

  get(modeS: string): readonly PassageObservation[] {
    return this.observations.get(normalizedModeS(modeS)) ?? [];
  }

  size() {
    return this.observations.size;
  }

  clear() {
    this.observations.clear();
  }
}

function regressionClosingSpeed(observations: readonly PassageObservation[]) {
  const recent = observations.slice(-6);
  if (recent.length < 2) return null;
  const start = recent[0].positionTimestampMs;
  const points = recent.map((item) => ({
    seconds: (item.positionTimestampMs - start) / 1000,
    distance: item.distanceKm
  }));
  const averageSeconds = points.reduce((sum, item) => sum + item.seconds, 0) / points.length;
  const averageDistance = points.reduce((sum, item) => sum + item.distance, 0) / points.length;
  const denominator = points.reduce((sum, item) => sum + (item.seconds - averageSeconds) ** 2, 0);
  if (denominator <= 0) return null;
  const slopeKmPerSecond = points.reduce(
    (sum, item) => sum + (item.seconds - averageSeconds) * (item.distance - averageDistance),
    0
  ) / denominator;
  return -slopeKmPerSecond * 1000;
}

function localPoint(observer: [number, number], latitude: number, longitude: number) {
  const northKm = (latitude - observer[0]) * 111.195;
  const eastKm = (longitude - observer[1]) * 111.195 * Math.cos(observer[0] * Math.PI / 180);
  return { eastKm, northKm };
}

function recentObservedVelocity(observations: readonly PassageObservation[], observer: [number, number]) {
  const latest = observations[observations.length - 1];
  const earliest = [...observations]
    .reverse()
    .find((item) => latest.positionTimestampMs - item.positionTimestampMs >= 8_000 && latest.positionTimestampMs - item.positionTimestampMs <= 120_000);
  if (!earliest) return null;
  const elapsed = (latest.positionTimestampMs - earliest.positionTimestampMs) / 1000;
  const start = localPoint(observer, earliest.latitude, earliest.longitude);
  const end = localPoint(observer, latest.latitude, latest.longitude);
  const eastKmPerSecond = (end.eastKm - start.eastKm) / elapsed;
  const northKmPerSecond = (end.northKm - start.northKm) / elapsed;
  const speedMetersPerSecond = Math.hypot(eastKmPerSecond, northKmPerSecond) * 1000;
  if (speedMetersPerSecond < 1 || speedMetersPerSecond > 420) return null;
  return { eastKmPerSecond, northKmPerSecond };
}

function projectedVelocity(
  aircraft: PassageAircraft,
  observations: readonly PassageObservation[],
  observer: [number, number]
) {
  if (
    aircraft.groundSpeedMetersPerSecond === null ||
    aircraft.trackDegrees === null ||
    aircraft.groundSpeedMetersPerSecond < 1
  ) return null;

  const track = aircraft.trackDegrees * Math.PI / 180;
  const speedKmPerSecond = aircraft.groundSpeedMetersPerSecond / 1000;
  const telemetry = {
    eastKmPerSecond: Math.sin(track) * speedKmPerSecond,
    northKmPerSecond: Math.cos(track) * speedKmPerSecond
  };
  const observed = recentObservedVelocity(observations, observer);
  if (!observed) return telemetry;
  return {
    eastKmPerSecond: observed.eastKmPerSecond * 0.6 + telemetry.eastKmPerSecond * 0.4,
    northKmPerSecond: observed.northKmPerSecond * 0.6 + telemetry.northKmPerSecond * 0.4
  };
}

function compassLabel(bearing: number) {
  const labels = ["nord", "nord-est", "est", "sud-est", "sud", "sud-ouest", "ouest", "nord-ouest"];
  return labels[Math.round(bearing / 45) % 8];
}

const EMPTY_ANALYSIS: Omit<PassageAnalysis, "status" | "gpsAccuracyLimited" | "gpsAccuracyMeters" | "historyPointCount"> = {
  currentDistanceKm: null,
  distanceDeltaKm: null,
  closingSpeedMetersPerSecond: null,
  estimatedSecondsToClosest: null,
  estimatedMinimumDistanceKm: null,
  observedMinimumDistanceKm: null,
  secondsSinceClosest: null,
  passageSide: null,
  freshnessSeconds: null,
  progressPercent: null
};

export function analyzeAircraftPassage(input: {
  aircraft: PassageAircraft;
  history: readonly PassageObservation[];
  observer: [number, number] | null;
  gpsAccuracyMeters?: number | null;
  nowMs?: number;
}): PassageAnalysis {
  const nowMs = input.nowMs ?? Date.now();
  const gpsAccuracyMeters = input.gpsAccuracyMeters ?? null;
  const common = {
    gpsAccuracyLimited: gpsAccuracyMeters !== null && gpsAccuracyMeters > GPS_ACCURACY_WARNING_METERS,
    gpsAccuracyMeters,
    historyPointCount: input.history.length
  };
  if (!input.observer) return { ...EMPTY_ANALYSIS, ...common, status: "no-observer" };

  const currentDistanceKm = distanceKm(input.observer, [input.aircraft.latitude, input.aircraft.longitude]);
  const freshnessSeconds = finite(input.aircraft.positionTimestampMs)
    ? Math.max(0, (nowMs - input.aircraft.positionTimestampMs) / 1000)
    : null;
  const base = { ...EMPTY_ANALYSIS, ...common, currentDistanceKm, freshnessSeconds };
  if (freshnessSeconds === null) return { ...base, status: "insufficient" };
  if (freshnessSeconds > AIRCRAFT_POSITION_STALE_AFTER_SECONDS) {
    return { ...base, status: "stale" };
  }

  const history = input.history.filter((item) => nowMs - item.positionTimestampMs <= PASSAGE_HISTORY_MAX_AGE_MS);
  if (history.length < 2) return { ...base, historyPointCount: history.length, status: "waiting" };

  const previous = history[history.length - 2];
  const latest = history[history.length - 1];
  const distanceDeltaKm = latest.distanceKm - previous.distanceKm;
  const closingSpeedMetersPerSecond = regressionClosingSpeed(history);
  const minimumObservation = history.reduce((minimum, item) => item.distanceKm < minimum.distanceKm ? item : minimum, history[0]);
  const minimumIndex = history.indexOf(minimumObservation);
  const observedMinimumDistanceKm = minimumObservation.distanceKm;
  const clearlyPastMinimum = minimumIndex < history.length - 1 && latest.distanceKm > observedMinimumDistanceKm + 0.05;
  const trendApproaching = closingSpeedMetersPerSecond !== null && closingSpeedMetersPerSecond > TREND_THRESHOLD_METERS_PER_SECOND;
  const trendReceding = closingSpeedMetersPerSecond !== null && closingSpeedMetersPerSecond < -TREND_THRESHOLD_METERS_PER_SECOND;

  const velocity = projectedVelocity(input.aircraft, history, input.observer);
  const relative = localPoint(input.observer, input.aircraft.latitude, input.aircraft.longitude);
  let projectedSeconds = null as number | null;
  let projectedMinimum = null as number | null;
  let passageSide = null as string | null;
  let progressPercent = null as number | null;
  let projectionIsNear = false;

  if (velocity) {
    const denominator = velocity.eastKmPerSecond ** 2 + velocity.northKmPerSecond ** 2;
    if (denominator > 0) {
      projectedSeconds = -(
        relative.eastKm * velocity.eastKmPerSecond +
        relative.northKm * velocity.northKmPerSecond
      ) / denominator;
      const closestEast = relative.eastKm + velocity.eastKmPerSecond * projectedSeconds;
      const closestNorth = relative.northKm + velocity.northKmPerSecond * projectedSeconds;
      projectedMinimum = Math.hypot(closestEast, closestNorth);
      projectionIsNear = projectedMinimum <= IMMEDIATE_PROXIMITY_KM;
      if (projectedMinimum >= 0.15 && projectedSeconds >= -60 && projectedSeconds <= PROJECTION_HORIZON_SECONDS) {
        const bearing = (Math.atan2(closestEast, closestNorth) * 180 / Math.PI + 360) % 360;
        passageSide = compassLabel(bearing);
      }

      const speedKmPerSecond = Math.sqrt(denominator);
      if (projectedMinimum < PASSAGE_PROGRESS_ZONE_KM) {
        const halfWindowSeconds = Math.sqrt(PASSAGE_PROGRESS_ZONE_KM ** 2 - projectedMinimum ** 2) / speedKmPerSecond;
        if (halfWindowSeconds > 0 && projectedSeconds <= halfWindowSeconds && projectedSeconds >= -halfWindowSeconds) {
          progressPercent = Math.max(0, Math.min(100, ((halfWindowSeconds - projectedSeconds) / (2 * halfWindowSeconds)) * 100));
        }
      }
    }
  }

  let status: PassageStatus;
  const nearProjectedClosest = projectedSeconds !== null && Math.abs(projectedSeconds) <= 20 && projectedMinimum !== null && projectedMinimum <= IMMEDIATE_PROXIMITY_KM;
  if (trendReceding || clearlyPastMinimum) {
    status = "receding";
  } else if (nearProjectedClosest || (!trendApproaching && !trendReceding && currentDistanceKm <= observedMinimumDistanceKm + 0.08)) {
    status = "closest";
  } else if (trendApproaching) {
    status = projectedMinimum !== null && !projectionIsNear ? "non-convergent" : "approaching";
  } else if (projectedMinimum !== null && !projectionIsNear) {
    status = "non-convergent";
  } else if (projectedSeconds !== null && projectedSeconds > 20 && projectedSeconds <= PROJECTION_HORIZON_SECONDS && projectionIsNear) {
    status = "approaching";
  } else {
    status = "insufficient";
  }

  const projectedFutureIsUsable = projectedSeconds !== null && projectedSeconds >= 0 && projectedSeconds <= PROJECTION_HORIZON_SECONDS;
  const secondsSinceClosest = status === "receding"
    ? Math.max(0, (nowMs - minimumObservation.positionTimestampMs) / 1000)
    : null;

  return {
    ...base,
    status,
    historyPointCount: history.length,
    distanceDeltaKm,
    closingSpeedMetersPerSecond,
    estimatedSecondsToClosest: status === "closest" ? 0 : status === "approaching" && projectedFutureIsUsable ? projectedSeconds : null,
    estimatedMinimumDistanceKm: projectedFutureIsUsable ? projectedMinimum : null,
    observedMinimumDistanceKm,
    secondsSinceClosest,
    passageSide: projectedFutureIsUsable || status === "closest" ? passageSide : null,
    progressPercent: ["approaching", "closest", "receding"].includes(status) ? progressPercent : null
  };
}

export function aircraftPositionTimestamp(lastPositionAt: string | null | undefined) {
  const parsed = typeof lastPositionAt === "string" ? Date.parse(lastPositionAt) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function droneOperationalPriority(input: {
  analysis: PassageAnalysis;
  altitudeMeters: number | null;
  isHelicopter: boolean;
  isRemarkable: boolean;
}) {
  const approaching = input.analysis.status === "approaching";
  if (approaching && input.altitudeMeters !== null && input.altitudeMeters <= 1500) return 1;
  if (approaching && input.isHelicopter) return 2;
  if (input.isRemarkable) return 3;
  if (input.analysis.status === "closest") return 4;
  if (input.analysis.status === "receding") return 5;
  return 6;
}

export function passageBearing(
  observer: [number, number],
  destination: [number, number]
) {
  return compassLabel(bearingDegrees(observer, destination));
}
