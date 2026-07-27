import { distanceKm } from "./geometry.ts";
import { readNotamInFrench } from "./notam.ts";

type UnknownRecord = Record<string, unknown>;

export type SofiaNotam = {
  id: string;
  reference: string;
  itemA: string;
  category: string;
  qCode: string;
  startsAt: string;
  endsAt: string;
  lowerFl: number | null;
  upperFl: number | null;
  coordinates: string | null;
  radiusNm: number | null;
  distanceToCenterKm: number | null;
  distanceToAreaKm: number | null;
  impactsPoint: boolean;
  activeNow: boolean;
  originalText: string;
  frenchText: string;
  translationSource: "sofia" | "assisted";
};

const SUBJECTS: Record<string, string> = {
  WU: "Aéronefs sans pilote / drones",
  RT: "Zone temporairement réglementée",
  RR: "Zone réglementée",
  RD: "Zone dangereuse",
  RP: "Zone interdite",
  RM: "Activité militaire",
  WE: "Exercices",
  WM: "Tirs ou lancements",
  WP: "Parachutisme ou vol libre",
  WA: "Manifestation aérienne",
  WZ: "Feux d’artifice",
  OB: "Obstacle",
  PL: "Plan de vol",
  SE: "Service d’information de vol",
  SP: "Contrôle d’approche",
  SC: "Centre de contrôle régional",
  CA: "Communications",
  FA: "Aérodrome"
};

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : null;
}

function finiteNumber(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function utcDate(value: unknown) {
  if (typeof value !== "string") return "Non déterminé";
  if (value.toUpperCase() === "PERM") return "Permanent";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString("fr-FR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) + " UTC";
}

export function formatSofiaCoordinate(value: number, axis: "latitude" | "longitude") {
  const maximum = axis === "latitude" ? 90 : 180;
  if (!Number.isFinite(value) || Math.abs(value) > maximum) throw new Error("Coordonnée invalide");
  const degreesWidth = axis === "latitude" ? 2 : 3;
  let degrees = Math.floor(Math.abs(value));
  let minutes = Math.round((Math.abs(value) - degrees) * 60);
  if (minutes === 60) {
    degrees += 1;
    minutes = 0;
  }
  const direction = axis === "latitude" ? value >= 0 ? "N" : "S" : value >= 0 ? "E" : "W";
  return `${String(degrees).padStart(degreesWidth, "0")}${String(minutes).padStart(2, "0")}${direction}`;
}

export function parseSofiaCoordinate(value: string): [number, number] | null {
  const match = value.match(/^(\d{2})(\d{2})([NS])(\d{3})(\d{2})([EW])$/i);
  if (!match) return null;
  const latitude = (Number(match[1]) + Number(match[2]) / 60) * (match[3].toUpperCase() === "S" ? -1 : 1);
  const longitude = (Number(match[4]) + Number(match[5]) / 60) * (match[6].toUpperCase() === "W" ? -1 : 1);
  return [latitude, longitude];
}

function isNotam(value: UnknownRecord) {
  return typeof value.id === "string" && typeof value.itemE === "string" && record(value.qLine) !== null;
}

function collectNotamRecords(value: unknown, found: UnknownRecord[]) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectNotamRecords(item, found));
    return;
  }
  const current = record(value);
  if (!current) return;
  if (isNotam(current)) {
    found.push(current);
    return;
  }
  Object.values(current).forEach((item) => collectNotamRecords(item, found));
}

function parseDate(value: unknown) {
  if (typeof value !== "string" || value.toUpperCase() === "PERM") return null;
  const milliseconds = new Date(value).getTime();
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

export function extractSofiaNotams(payload: unknown, point: [number, number], now = new Date()): SofiaNotam[] {
  const records: UnknownRecord[] = [];
  collectNotamRecords(payload, records);
  const unique = new Map<string, UnknownRecord>();
  records.forEach((item) => unique.set(String(item.id), item));
  const nowMs = now.getTime();

  return [...unique.values()].map((item) => {
    const qLine = record(item.qLine) ?? {};
    const code23 = typeof qLine.code23 === "string" ? qLine.code23 : "";
    const code45 = typeof qLine.code45 === "string" ? qLine.code45 : "";
    const coordinates = typeof item.coordinates === "string" ? item.coordinates : null;
    const center = coordinates ? parseSofiaCoordinate(coordinates) : null;
    const radiusNm = finiteNumber(item.radius);
    const distanceToCenterKm = center ? distanceKm(point, center) : null;
    const distanceToAreaKm = distanceToCenterKm === null ? null : Math.max(0, distanceToCenterKm - (radiusNm ?? 0) * 1.852);
    const originalText = String(item.itemE);
    const officialFrench = record(item.multiLanguage)?.itemE;
    const hasOfficialFrench = typeof officialFrench === "string" && Boolean(officialFrench.trim());
    const frenchText = hasOfficialFrench
      ? officialFrench.trim()
      : readNotamInFrench(`E) ${originalText}`)?.frenchText ?? originalText;
    const number = String(item.number ?? "").padStart(4, "0");
    const year = String(item.year ?? "").padStart(2, "0");
    const startMs = parseDate(item.startValidity);
    const endMs = parseDate(item.endValidity);
    const permanent = typeof item.endValidity === "string" && item.endValidity.toUpperCase() === "PERM";

    return {
      id: String(item.id),
      reference: `${String(item.nof ?? "")}-${String(item.series ?? "")}${number}/${year}`,
      itemA: typeof item.itemA === "string" ? item.itemA : "Non déterminé",
      category: SUBJECTS[code23] ?? `Sujet Q${code23 || "—"}`,
      qCode: `Q${code23}${code45}`,
      startsAt: utcDate(item.startValidity),
      endsAt: utcDate(item.endValidity),
      lowerFl: finiteNumber(qLine.lower),
      upperFl: finiteNumber(qLine.upper),
      coordinates,
      radiusNm,
      distanceToCenterKm,
      distanceToAreaKm,
      impactsPoint: distanceToAreaKm === 0,
      activeNow: (startMs === null || startMs <= nowMs) && (permanent || endMs === null || endMs >= nowMs),
      originalText,
      frenchText,
      translationSource: hasOfficialFrench ? "sofia" as const : "assisted" as const
    };
  }).sort((a, b) => {
    const activeOrder = Number(b.activeNow) - Number(a.activeNow);
    if (activeOrder) return activeOrder;
    return (a.distanceToAreaKm ?? Infinity) - (b.distanceToAreaKm ?? Infinity);
  });
}
