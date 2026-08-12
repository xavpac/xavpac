import assert from "node:assert/strict";
import test from "node:test";
import { buildSpotterSkyMood, spotterChallengeScore } from "../../app/lib/aviation/spotterFun.ts";

test("priorise une mission nationale dans l’ambiance du ciel", () => {
  const mood = buildSpotterSkyMood({ aircraftCount: 18, closestDistanceKm: 2, remarkableCount: 1, nationalCount: 1 });
  assert.equal(mood.label, "MISSION SPÉCIALE");
  assert.equal(mood.level, "special");
});

test("invite à lever les yeux pour un passage à moins de cinq kilomètres", () => {
  const mood = buildSpotterSkyMood({ aircraftCount: 2, closestDistanceKm: 4.9, remarkableCount: 0, nationalCount: 0 });
  assert.equal(mood.label, "LÈVE LES YEUX");
});

test("le score ludique reste borné entre zéro et quatre-vingt-dix-neuf", () => {
  assert.equal(spotterChallengeScore({ aircraftCount: 0, closestDistanceKm: null, remarkableCount: 0, nationalCount: 0 }), 0);
  assert.equal(spotterChallengeScore({ aircraftCount: 80, closestDistanceKm: 1, remarkableCount: 4, nationalCount: 3 }), 99);
});

