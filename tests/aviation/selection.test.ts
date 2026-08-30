import assert from "node:assert/strict";
import test from "node:test";
import { resolvePreferredAircraftId } from "../../app/lib/aviation/selection.ts";

test("sélectionne un moyen national avant l'avion le plus proche", () => {
  assert.equal(resolvePreferredAircraftId({
    aircraftIds: ["near", "far"],
    nationalAssetIds: ["dragon"],
    selectedId: null,
    manualSelection: false,
    selectionDismissed: false
  }), "dragon");
});

test("sélectionne l'avion le plus proche sans moyen national", () => {
  assert.equal(resolvePreferredAircraftId({
    aircraftIds: ["near", "far"],
    nationalAssetIds: [],
    selectedId: null,
    manualSelection: false,
    selectionDismissed: false
  }), "near");
});

test("respecte une sélection manuelle encore visible", () => {
  assert.equal(resolvePreferredAircraftId({
    aircraftIds: ["near", "chosen"],
    nationalAssetIds: ["dragon"],
    selectedId: "chosen",
    manualSelection: true,
    selectionDismissed: false
  }), "chosen");
});

test("ne rouvre rien après une fermeture explicite", () => {
  assert.equal(resolvePreferredAircraftId({
    aircraftIds: ["near"],
    nationalAssetIds: ["dragon"],
    selectedId: null,
    manualSelection: false,
    selectionDismissed: true
  }), null);
});
