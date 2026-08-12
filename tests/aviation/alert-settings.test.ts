import assert from "node:assert/strict";
import test from "node:test";
import { AVIATION_RADIUS_OPTIONS, normalizeAviationRadius } from "../../app/lib/aviation/alertSettings.ts";

test("accepte uniquement les rayons proposés dans l’interface", () => {
  assert.deepEqual(AVIATION_RADIUS_OPTIONS, [10, 20, 50, 100]);
  assert.equal(normalizeAviationRadius("10"), 10);
  assert.equal(normalizeAviationRadius(100), 100);
});

test("revient à 50 km si le rayon enregistré est invalide", () => {
  assert.equal(normalizeAviationRadius("75"), 50);
  assert.equal(normalizeAviationRadius(null), 50);
});

