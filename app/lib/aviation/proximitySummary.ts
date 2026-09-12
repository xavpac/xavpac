export type AircraftProximitySummary = {
  nearestLabel: string | null;
  nearestDistanceKm: number | null;
  within10Km: number;
  within15Km: number;
  within20Km: number;
};

type AircraftDistance = {
  callsign?: string | null;
  distance: number;
};

export function aircraftCoverageRadius(radiusKm: number) {
  return Math.max(radiusKm, 20);
}

export function summarizeAircraftProximity(aircraft: AircraftDistance[]): AircraftProximitySummary {
  const detected = aircraft
    .filter((item) => Number.isFinite(item.distance) && item.distance >= 0)
    .sort((left, right) => left.distance - right.distance);
  const nearest = detected[0] ?? null;

  return {
    nearestLabel: nearest?.callsign?.trim() || null,
    nearestDistanceKm: nearest?.distance ?? null,
    within10Km: detected.filter((item) => item.distance <= 10).length,
    within15Km: detected.filter((item) => item.distance <= 15).length,
    within20Km: detected.filter((item) => item.distance <= 20).length
  };
}
