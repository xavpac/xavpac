export const FIRMS_SOURCES = [
  "VIIRS_SNPP_NRT",
  "VIIRS_NOAA20_NRT",
  "VIIRS_NOAA21_NRT",
  "MODIS_NRT"
] as const;

export type FirmsSource = (typeof FIRMS_SOURCES)[number];

export type FirmsDetection = {
  id: string;
  latitude: number;
  longitude: number;
  acquiredAt: string;
  satellite: string;
  instrument: string;
  confidence: string | null;
  frpMw: number | null;
  dayNight: "day" | "night" | null;
  source: FirmsSource;
};

export type FirmsFeed = {
  status: "available" | "unavailable";
  source: "NASA FIRMS";
  retrievedAt: string;
  detections: FirmsDetection[];
  message: string;
};

function parseCsvRows(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (character === '"') {
      if (quoted && csv[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && csv[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += character;
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function acquisitionIso(date: string, time: string) {
  const compactTime = time.padStart(4, "0").slice(-4);
  const iso = `${date}T${compactTime.slice(0, 2)}:${compactTime.slice(2)}:00.000Z`;
  return Number.isFinite(Date.parse(iso)) ? iso : null;
}

function finiteNumber(value: string | undefined) {
  if (!value?.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function dayNight(value: string | undefined): FirmsDetection["dayNight"] {
  if (value?.toUpperCase() === "D") return "day";
  if (value?.toUpperCase() === "N") return "night";
  return null;
}

export function parseFirmsCsv(csv: string, source: FirmsSource): FirmsDetection[] {
  const rows = parseCsvRows(csv);
  const header = rows.shift()?.map((item) => item.trim().toLowerCase()) ?? [];
  if (!header.includes("latitude") || !header.includes("longitude")) return [];

  const valueAt = (row: string[], key: string) => row[header.indexOf(key)];
  const detections = rows.flatMap((row): FirmsDetection[] => {
    const latitude = finiteNumber(valueAt(row, "latitude"));
    const longitude = finiteNumber(valueAt(row, "longitude"));
    const acquiredAt = acquisitionIso(valueAt(row, "acq_date") ?? "", valueAt(row, "acq_time") ?? "");
    if (latitude === null || longitude === null || acquiredAt === null
      || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return [];

    const satellite = valueAt(row, "satellite")?.trim() || "Satellite non précisé";
    const instrument = valueAt(row, "instrument")?.trim() || "Instrument non précisé";
    const confidence = valueAt(row, "confidence")?.trim() || null;
    return [{
      id: `${source}:${latitude.toFixed(5)}:${longitude.toFixed(5)}:${acquiredAt}`,
      latitude,
      longitude,
      acquiredAt,
      satellite,
      instrument,
      confidence,
      frpMw: finiteNumber(valueAt(row, "frp")),
      dayNight: dayNight(valueAt(row, "daynight")),
      source
    }];
  });

  return [...new Map(detections.map((detection) => [detection.id, detection])).values()]
    .sort((first, second) => Date.parse(second.acquiredAt) - Date.parse(first.acquiredAt));
}

export function firmsBoundingBox(latitude: number, longitude: number, radiusKm: number) {
  const latitudeDelta = radiusKm / 111.32;
  const longitudeDelta = radiusKm / (111.32 * Math.max(Math.cos(latitude * Math.PI / 180), 0.2));
  return {
    west: Math.max(-180, longitude - longitudeDelta),
    south: Math.max(-90, latitude - latitudeDelta),
    east: Math.min(180, longitude + longitudeDelta),
    north: Math.min(90, latitude + latitudeDelta)
  };
}

export function isFirmsSource(value: string): value is FirmsSource {
  return (FIRMS_SOURCES as readonly string[]).includes(value);
}

export function distanceBetweenKm(first: [number, number], second: [number, number]) {
  const earthRadiusKm = 6371;
  const toRadians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = toRadians(second[0] - first[0]);
  const longitudeDelta = toRadians(second[1] - first[1]);
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(first[0])) * Math.cos(toRadians(second[0])) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}
