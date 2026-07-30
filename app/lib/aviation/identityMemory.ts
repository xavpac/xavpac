import { normalizeModeS } from "./callsign.ts";
import type { EnrichedAircraft, LearnedAircraftIdentity } from "./types.ts";

const STORAGE_KEY = "xavpac-aircraft-identities-v2";
const MAX_IDENTITIES = 1500;

type StoredIdentities = Record<string, LearnedAircraftIdentity>;

function readAll(): StoredIdentities {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as StoredIdentities : {};
  } catch {
    return {};
  }
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
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(limited)); } catch { /* stockage privé ou plein */ }
}
