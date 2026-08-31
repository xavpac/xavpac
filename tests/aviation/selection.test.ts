import assert from "node:assert/strict";
import test from "node:test";
import { resolvePreferredAircraftId } from "../../app/lib/aviation/selection.ts";

test("sélectionne réellement l'aéronef le plus proche même si un moyen national est visible", () => {
  assert.equal(resolvePreferredAircraftId({
    candidates: [
      { id: "near", distanceKm: 2.4 },
      { id: "far", distanceKm: 18 },
      { id: "dragon", distanceKm: 12, national: true }
    ],
    selectedId: null,
    manualSelection: false,
    selectionDismissed: false
  }), "near");
});

test("sélectionne le moyen national quand il est réellement le plus proche", () => {
  assert.equal(resolvePreferredAircraftId({
    candidates: [
      { id: "near", distanceKm: 2.4 },
      { id: "dragon", distanceKm: 1.2, national: true }
    ],
    selectedId: null,
    manualSelection: false,
    selectionDismissed: false
  }), "dragon");
});

test("utilise la priorité nationale uniquement en cas de distance strictement identique", () => {
  assert.equal(resolvePreferredAircraftId({
    candidates: [
      { id: "near", distanceKm: 2.4 },
      { id: "dragon", distanceKm: 2.4, national: true }
    ],
    selectedId: null,
    manualSelection: false,
    selectionDismissed: false
  }), "dragon");
});

test("respecte une sélection manuelle encore visible", () => {
  assert.equal(resolvePreferredAircraftId({
    candidates: [
      { id: "near", distanceKm: 1 },
      { id: "chosen", distanceKm: 7 },
      { id: "dragon", distanceKm: 3, national: true }
    ],
    selectedId: "chosen",
    manualSelection: true,
    selectionDismissed: false
  }), "chosen");
});

test("ne rouvre rien après une fermeture explicite", () => {
  assert.equal(resolvePreferredAircraftId({
    candidates: [
      { id: "near", distanceKm: 1 },
      { id: "dragon", distanceKm: 3, national: true }
    ],
    selectedId: null,
    manualSelection: false,
    selectionDismissed: true
  }), null);
});
