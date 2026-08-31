export type AircraftSelectionCandidate = {
  id: string;
  distanceKm: number;
  national?: boolean;
};

export function resolvePreferredAircraftId(input: {
  candidates: readonly AircraftSelectionCandidate[];
  selectedId: string | null;
  manualSelection: boolean;
  selectionDismissed: boolean;
}) {
  if (input.selectionDismissed) return null;
  const available = new Set(input.candidates.map((candidate) => candidate.id));
  if (input.manualSelection && input.selectedId && available.has(input.selectedId)) return input.selectedId;
  return [...input.candidates]
    .filter((candidate) => candidate.id && Number.isFinite(candidate.distanceKm) && candidate.distanceKm >= 0)
    .sort((left, right) => left.distanceKm - right.distanceKm || Number(Boolean(right.national)) - Number(Boolean(left.national)))[0]?.id ?? null;
}
