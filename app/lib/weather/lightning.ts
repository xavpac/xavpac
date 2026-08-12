export type LightningQuality = {
  precisionMeters?: number;
  detectionQuality?: string;
};

export type LightningStrike = {
  id: string;
  latitude: number;
  longitude: number;
  occurredAtUtc: string;
  occurredAtLocal: string;
  source: string;
  retrievedAt: string;
  type?: "cloud-ground" | "intra-cloud";
  polarity?: "positive" | "negative";
  peakCurrentKa?: number;
  quality?: LightningQuality;
};

export type LightningFeed = {
  status: "available" | "unavailable";
  source: string | null;
  retrievedAt: string;
  availableSince: string | null;
  impacts: LightningStrike[];
  message: string;
};

export type LightningSummary = {
  count: number;
  within2Km: number;
  within3Km: number;
  within5Km: number;
  within10Km: number;
  nearestKm: number | null;
  latestAt: string | null;
  mainSector: string | null;
};

export type LightningTrend = {
  label: "Activité se rapprochant" | "Activité globalement stable" | "Activité s’éloignant" | "Tendance indéterminée";
  confidence: "élevée" | "moyenne" | "faible" | "indéterminée";
  reason: string;
};

export type LightningAgeBand = "under-5" | "5-15" | "15-30" | "30-60" | "older";

const FRANCE_LIGHTNING_CENTER: [number, number] = [46.603354, 1.888334];
const EARTH_RADIUS_KM = 6371.0088;

function validPosition(position: [number, number] | null | undefined): position is [number, number] {
  return Boolean(position
    && Number.isFinite(position[0])
    && Number.isFinite(position[1])
    && position[0] >= -90
    && position[0] <= 90
    && position[1] >= -180
    && position[1] <= 180);
}

function radians(value: number) {
  return value * Math.PI / 180;
}

export function lightningDistanceKm(reference: [number, number], strike: Pick<LightningStrike, "latitude" | "longitude">) {
  const latitudeDelta = radians(strike.latitude - reference[0]);
  const longitudeDelta = radians(strike.longitude - reference[1]);
  const firstLatitude = radians(reference[0]);
  const secondLatitude = radians(strike.latitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

export function lightningBearing(reference: [number, number], strike: Pick<LightningStrike, "latitude" | "longitude">) {
  const firstLatitude = radians(reference[0]);
  const secondLatitude = radians(strike.latitude);
  const longitudeDelta = radians(strike.longitude - reference[1]);
  const y = Math.sin(longitudeDelta) * Math.cos(secondLatitude);
  const x = Math.cos(firstLatitude) * Math.sin(secondLatitude)
    - Math.sin(firstLatitude) * Math.cos(secondLatitude) * Math.cos(longitudeDelta);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

export function lightningCardinalDirection(bearing: number) {
  const directions = ["nord", "nord-est", "est", "sud-est", "sud", "sud-ouest", "ouest", "nord-ouest"];
  return directions[Math.round(((bearing % 360) + 360) % 360 / 45) % directions.length];
}

export function lightningAgeMinutes(strike: Pick<LightningStrike, "occurredAtUtc">, nowMs = Date.now()) {
  return Math.max(0, (nowMs - Date.parse(strike.occurredAtUtc)) / 60_000);
}

export function lightningAgeBand(ageMinutes: number): LightningAgeBand {
  if (ageMinutes < 5) return "under-5";
  if (ageMinutes < 15) return "5-15";
  if (ageMinutes < 30) return "15-30";
  if (ageMinutes < 60) return "30-60";
  return "older";
}

function median(values: number[]) {
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function circularMean(values: number[]) {
  if (!values.length) return null;
  const x = values.reduce((sum, value) => sum + Math.cos(radians(value)), 0);
  const y = values.reduce((sum, value) => sum + Math.sin(radians(value)), 0);
  if (Math.abs(x) < Number.EPSILON && Math.abs(y) < Number.EPSILON) return null;
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

export function summarizeLightning(impacts: LightningStrike[], reference: [number, number], windowMinutes: number, nowMs = Date.now()): LightningSummary {
  const recent = impacts.filter((impact) => lightningAgeMinutes(impact, nowMs) <= windowMinutes);
  const distances = recent.map((impact) => lightningDistanceKm(reference, impact));
  const bearings = recent.map((impact) => lightningBearing(reference, impact));
  const mainBearing = circularMean(bearings);
  const latest = recent.reduce<LightningStrike | null>((current, impact) => {
    if (!current || Date.parse(impact.occurredAtUtc) > Date.parse(current.occurredAtUtc)) return impact;
    return current;
  }, null);
  return {
    count: recent.length,
    within2Km: distances.filter((distance) => distance < 2).length,
    within3Km: distances.filter((distance) => distance < 3).length,
    within5Km: distances.filter((distance) => distance < 5).length,
    within10Km: distances.filter((distance) => distance < 10).length,
    nearestKm: distances.length ? Math.min(...distances) : null,
    latestAt: latest?.occurredAtUtc ?? null,
    mainSector: mainBearing === null ? null : lightningCardinalDirection(mainBearing)
  };
}

export function analyzeLightningTrend(impacts: LightningStrike[], reference: [number, number], nowMs = Date.now()): LightningTrend {
  const windows = [[20, 30], [10, 20], [0, 10]].map(([minimumAge, maximumAge]) => impacts
    .filter((impact) => {
      const age = lightningAgeMinutes(impact, nowMs);
      return age >= minimumAge && age < maximumAge;
    })
    .map((impact) => lightningDistanceKm(reference, impact)));
  if (windows.some((window) => window.length < 3)) {
    return { label: "Tendance indéterminée", confidence: "indéterminée", reason: "Au moins trois impacts sont requis dans chacune des trois fenêtres de dix minutes." };
  }
  const medians = windows.map(median);
  const movement = medians[0] - medians[2];
  const coherent = (medians[0] >= medians[1] && medians[1] >= medians[2])
    || (medians[0] <= medians[1] && medians[1] <= medians[2]);
  const total = windows.reduce((sum, window) => sum + window.length, 0);
  const confidence = total >= 30 && coherent ? "élevée" : total >= 15 && coherent ? "moyenne" : "faible";
  if (!coherent) return { label: "Tendance indéterminée", confidence: "faible", reason: "Les distances médianes ne suivent pas une évolution cohérente." };
  if (movement >= 2) return { label: "Activité se rapprochant", confidence, reason: `La distance médiane a diminué de ${movement.toFixed(1)} km sur trente minutes.` };
  if (movement <= -2) return { label: "Activité s’éloignant", confidence, reason: `La distance médiane a augmenté de ${Math.abs(movement).toFixed(1)} km sur trente minutes.` };
  return { label: "Activité globalement stable", confidence, reason: "La variation de distance médiane reste inférieure à 2 km." };
}

export function lightningActivityLabel(impactsInTenMinutesWithinTenKm: number) {
  if (impactsInTenMinutesWithinTenKm === 0) return "Aucune activité récente";
  if (impactsInTenMinutesWithinTenKm <= 2) return "Faible activité";
  if (impactsInTenMinutesWithinTenKm <= 9) return "Activité modérée";
  if (impactsInTenMinutesWithinTenKm <= 24) return "Activité soutenue";
  return "Forte activité";
}

export function lightningMapUrl(position?: [number, number] | null) {
  const center = validPosition(position) ? position : FRANCE_LIGHTNING_CENTER;
  const zoom = validPosition(position) ? 9 : 5;
  const parameters = new URLSearchParams({
    MapInteractive: "1",
    NavigationControl: "1",
    FullScreenControl: "1",
    Cookies: "0",
    InfoDiv: "1",
    MenuDiv: "1",
    GeolocateControl: "0",
    ScaleControl: "1",
    LinksChecked: "1",
    LinksRange: "10",
    MapStyle: "2",
    MapStyleRange: "10"
  });
  return `https://maps.blitzortung.org/fr/?${parameters.toString()}#${zoom}/${center[0].toFixed(5)}/${center[1].toFixed(5)}`;
}

export const LIGHTNING_PUBLIC_MAP_URL = "https://maps.blitzortung.org/fr/";
