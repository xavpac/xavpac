export function resolvePreferredAircraftId(input: {
  aircraftIds: readonly string[];
  nationalAssetIds: readonly string[];
  selectedId: string | null;
  manualSelection: boolean;
  selectionDismissed: boolean;
}) {
  if (input.selectionDismissed) return null;
  const available = new Set([...input.aircraftIds, ...input.nationalAssetIds]);
  if (input.manualSelection && input.selectedId && available.has(input.selectedId)) return input.selectedId;
  return input.nationalAssetIds[0] ?? input.aircraftIds[0] ?? null;
}
