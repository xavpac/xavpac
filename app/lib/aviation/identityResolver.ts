import type {
  AircraftCategory,
  DataMethod,
  IdentityFieldEvidence,
  IdentityFieldName,
  IdentityStatus,
  RouteConfidence
} from "./types.ts";

export type IdentityValues = {
  registration: string | null;
  manufacturer: string | null;
  aircraftModel: string | null;
  icaoTypeCode: string | null;
  operator: string | null;
  category: AircraftCategory;
};

export type IdentityCandidate = {
  source: string;
  retrievedAt: string;
  confidence: RouteConfidence;
  method: DataMethod;
  priority: number;
  values: Partial<Record<IdentityFieldName, string | null | undefined>>;
};

export type ResolvedAircraftIdentity = IdentityValues & {
  status: IdentityStatus;
  sources: string[];
  fields: Partial<Record<IdentityFieldName, IdentityFieldEvidence>>;
};

const confidenceRank: Record<RouteConfidence, number> = {
  confirmed: 4,
  probable: 3,
  inferred: 2,
  unavailable: 1
};

function clean(field: IdentityFieldName, value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) return null;
  if (field === "registration" || field === "icaoTypeCode") return normalized.toUpperCase();
  if (field === "category") return normalized.toLowerCase() === "unknown" ? null : normalized.toLowerCase();
  return normalized;
}

function category(value: string | null): AircraftCategory {
  if (!value) return "unknown";
  const allowed: AircraftCategory[] = ["airliner", "turboprop", "light", "helicopter", "military", "drone", "specialized", "unknown"];
  return allowed.includes(value as AircraftCategory) ? value as AircraftCategory : "unknown";
}

export function resolveAircraftIdentity(candidates: IdentityCandidate[]): ResolvedAircraftIdentity {
  const fields: Partial<Record<IdentityFieldName, IdentityFieldEvidence>> = {};
  const selectedScores = new Map<IdentityFieldName, number>();
  const selectedPriorities = new Map<IdentityFieldName, number>();

  for (const candidate of candidates) {
    for (const field of Object.keys(candidate.values) as IdentityFieldName[]) {
      const value = clean(field, candidate.values[field]);
      if (!value) continue;
      const score = confidenceRank[candidate.confidence];
      const previousScore = selectedScores.get(field) ?? -1;
      const previousPriority = selectedPriorities.get(field) ?? -1;
      if (score < previousScore || (score === previousScore && candidate.priority <= previousPriority)) continue;
      fields[field] = {
        value,
        source: candidate.source,
        retrievedAt: candidate.retrievedAt,
        confidence: candidate.confidence,
        method: candidate.method,
        freshnessSeconds: Math.max(0, Math.round((Date.now() - Date.parse(candidate.retrievedAt)) / 1000)) || 0
      };
      selectedScores.set(field, score);
      selectedPriorities.set(field, candidate.priority);
    }
  }

  const registration = fields.registration?.value ?? null;
  const manufacturer = fields.manufacturer?.value ?? null;
  const aircraftModel = fields.aircraftModel?.value ?? null;
  const icaoTypeCode = fields.icaoTypeCode?.value ?? null;
  const operator = fields.operator?.value ?? null;
  const aircraftCategory = category(fields.category?.value ?? null);
  const knownFields = [registration, manufacturer, aircraftModel, icaoTypeCode, operator].filter(Boolean).length;
  const status: IdentityStatus = registration && (aircraftModel || icaoTypeCode) && operator
    ? "complete"
    : knownFields > 0 || aircraftCategory !== "unknown" ? "partial" : "unknown";

  return {
    registration,
    manufacturer,
    aircraftModel,
    icaoTypeCode,
    operator,
    category: aircraftCategory,
    status,
    sources: [...new Set(Object.values(fields).map((evidence) => evidence?.source).filter((source): source is string => Boolean(source)))],
    fields
  };
}
