import { normalizeModeS } from "./callsign.ts";
import type { EnrichedAircraft, LearnedAircraftIdentity } from "./types.ts";
import { getBrowserStorage, parseStoredJson, safeGetItem, safeWriteJson, XAVPAC_STORAGE_KEYS } from "../safeStorage.ts";

const STORAGE_KEY = XAVPAC_STORAGE_KEYS.aircraftIdentities;
const MAX_IDENTITIES = 1500;

type StoredIdentities = Record<string, LearnedAircraftIdentity>;

const categories = new Set<LearnedAircraftIdentity["category"]>(["airliner", "turboprop", "light", "helicopter", "military", "drone", "specialized", "unknown"]);
const confidences = new Set<LearnedAircraftIdentity["confidence"]>(["confirmed", "probable", "inferred", "unavailable"]);

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function normalizeStoredIdentity(key: string, value: unknown): LearnedAircraftIdentity | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const identity = value as Partial<LearnedAircraftIdentity>;
  const modeS = normalizeModeS(identity.modeS);
  const updatedAt = typeof identity.updatedAt === "string" ? identity.updatedAt : "";
  if (!modeS || modeS !== normalizeModeS(key) || !Number.isFinite(Date.parse(updatedAt))) return null;
  return {
    modeS,
    registration: nullableString(identity.registration),
    manufacturer: nullableString(identity.manufacturer),
    aircraftModel: nullableString(identity.aircraftModel),
    icaoTypeCode: nullableString(identity.icaoTypeCode),
    operator: nullableString(identity.operator),
    category: categories.has(identity.category as LearnedAircraftIdentity["category"]) ? identity.category as LearnedAircraftIdentity["category"] : "unknown",
    confidence: confidences.has(identity.confidence as LearnedAircraftIdentity["confidence"]) ? identity.confidence as LearnedAircraftIdentity["confidence"] : "unavailable",
    sources: Array.isArray(identity.sources) ? identity.sources.filter((source): source is string => typeof source === "string") : [],
    updatedAt
  };
}

function readAll(): StoredIdentities {
  const parsed = parseStoredJson(safeGetItem(getBrowserStorage("local"), STORAGE_KEY));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return Object.fromEntries(Object.entries(parsed)
    .map(([modeS, value]) => [normalizeModeS(modeS), normalizeStoredIdentity(modeS, value)] as const)
    .filter((entry): entry is readonly [string, LearnedAircraftIdentity] => Boolean(entry[0] && entry[1]))) as StoredIdentities;
}

function usable(value: LearnedAircraftIdentity | null | undefined, modeS: string) {
  return value && normalizeModeS(value.modeS) === modeS ? value : null;
}

export function readLearnedAircraftIdentity(modeSValue: string | null | undefined) {
  const modeS = normalizeModeS(modeSValue);
  if (!modeS) return null;
  return usable(readAll()[modeS], modeS);
}

export function rememberAircraftIdentities(values: EnrichedAircraft[]) {
  if (typeof window === "undefined" || !values.length) return;
  const current = readAll();
  for (const value of values) {
    const modeS = normalizeModeS(value.modeS);
    if (!modeS || value.identityStatus === "unknown") continue;
    current[modeS] = {
      modeS,
      registration: value.registration,
      manufacturer: value.manufacturer,
      aircraftModel: value.aircraftModel,
      icaoTypeCode: value.icaoTypeCode,
      operator: value.aircraftOperator,
      category: value.aircraftCategory,
      confidence: value.identityProvenance.confidence,
      sources: value.identitySources,
      updatedAt: value.dataUpdatedAt
    };
  }
  const limited = Object.fromEntries(
    Object.entries(current)
      .sort(([, a], [, b]) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, MAX_IDENTITIES)
  );
  safeWriteJson(getBrowserStorage("local"), STORAGE_KEY, limited);
}
