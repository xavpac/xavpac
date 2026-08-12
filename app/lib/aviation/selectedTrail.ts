export type SelectedTrailGeometry = {
  kind: "observed" | "heading";
  positions: [number, number][];
};

type SelectedTrailInput = {
  observedPositions: [number, number][];
  currentPosition: [number, number];
  trackDegrees: number | null;
  speedMetersPerSecond: number | null;
};

function isValidPosition(position: [number, number]) {
  return Number.isFinite(position[0]) && Number.isFinite(position[1]);
}

function destinationPoint(origin: [number, number], bearingDegrees: number, distanceKm: number): [number, number] {
  const earthRadiusKm = 6371;
  const angularDistance = distanceKm / earthRadiusKm;
  const bearing = bearingDegrees * Math.PI / 180;
  const latitude = origin[0] * Math.PI / 180;
  const longitude = origin[1] * Math.PI / 180;
  const destinationLatitude = Math.asin(
    Math.sin(latitude) * Math.cos(angularDistance)
      + Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing)
  );
  const destinationLongitude = longitude + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude),
    Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(destinationLatitude)
  );
  return [destinationLatitude * 180 / Math.PI, destinationLongitude * 180 / Math.PI];
}

export function appendObservedPosition(
  positions: [number, number][],
  nextPosition: [number, number],
  maximumPositions = 50
) {
  if (!isValidPosition(nextPosition)) return positions;
  const previous = positions[positions.length - 1];
  const moved = !previous
    || Math.abs(previous[0] - nextPosition[0]) > 0.00005
    || Math.abs(previous[1] - nextPosition[1]) > 0.00005;
  return moved ? [...positions, nextPosition].slice(-maximumPositions) : positions;
}

export function buildSelectedTrail({
  observedPositions,
  currentPosition,
  trackDegrees,
  speedMetersPerSecond
}: SelectedTrailInput): SelectedTrailGeometry | null {
  const observed = observedPositions.filter(isValidPosition);
  if (observed.length >= 2) return { kind: "observed", positions: observed };
  if (!isValidPosition(currentPosition) || trackDegrees === null || !Number.isFinite(trackDegrees)) return null;

  // Cette courte ligne pointillée matérialise uniquement le cap courant pendant
  // l'acquisition des prochains points ADS-B. Elle n'est jamais présentée comme
  // une trajectoire historique observée.
  const speed = speedMetersPerSecond !== null && Number.isFinite(speedMetersPerSecond)
    ? Math.max(0, speedMetersPerSecond)
    : 0;
  const guideLengthKm = Math.min(5, Math.max(1.2, speed * 45 / 1000));
  const start = destinationPoint(currentPosition, (trackDegrees + 180) % 360, guideLengthKm);
  return { kind: "heading", positions: [start, currentPosition] };
}
