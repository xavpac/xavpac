export function distanceKm(origin: [number, number], destination: [number, number]) {
  const toRadians = (value: number) => value * Math.PI / 180;
  const lat1 = toRadians(origin[0]);
  const lat2 = toRadians(destination[0]);
  const deltaLat = lat2 - lat1;
  const deltaLon = toRadians(destination[1] - origin[1]);
  const value = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function bearingDegrees(origin: [number, number], destination: [number, number]) {
  const toRadians = (value: number) => value * Math.PI / 180;
  const lat1 = toRadians(origin[0]);
  const lat2 = toRadians(destination[0]);
  const deltaLon = toRadians(destination[1] - origin[1]);
  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

export function closestApproach(
  observer: [number, number],
  aircraft: { latitude: number; longitude: number; velocity: number | null; trueTrack: number | null }
) {
  const currentDistanceKm = distanceKm(observer, [aircraft.latitude, aircraft.longitude]);
  if (aircraft.velocity === null || aircraft.trueTrack === null || aircraft.velocity < 2) {
    return { state: "position" as const, seconds: null, minimumDistanceKm: currentDistanceKm };
  }
  const north = (aircraft.latitude - observer[0]) * 111;
  const east = (aircraft.longitude - observer[1]) * 111 * Math.cos(observer[0] * Math.PI / 180);
  const track = aircraft.trueTrack * Math.PI / 180;
  const speedKmPerSecond = aircraft.velocity / 1000;
  const eastVelocity = Math.sin(track) * speedKmPerSecond;
  const northVelocity = Math.cos(track) * speedKmPerSecond;
  const denominator = eastVelocity ** 2 + northVelocity ** 2;
  const rawSeconds = denominator > 0 ? -((east * eastVelocity + north * northVelocity) / denominator) : 0;
  const seconds = Math.max(0, Math.min(rawSeconds, 7200));
  const minimumDistanceKm = Math.hypot(east + eastVelocity * seconds, north + northVelocity * seconds);
  if (rawSeconds < -30) return { state: "passed" as const, seconds: Math.abs(rawSeconds), minimumDistanceKm };
  if (rawSeconds <= 0) return { state: "now" as const, seconds: 0, minimumDistanceKm };
  if (rawSeconds > 7200) return { state: "position" as const, seconds: null, minimumDistanceKm: currentDistanceKm };
  return { state: "approaching" as const, seconds: rawSeconds, minimumDistanceKm };
}
