import assert from "node:assert/strict";
import test from "node:test";
import { assessGpsQuality, formatPositionAge } from "../../app/lib/geolocationQuality.ts";

test("classe la précision GPS selon les seuils XavPac", () => {
  assert.equal(assessGpsQuality(6, 2).quality, "excellent");
  assert.equal(assessGpsQuality(30, 2).quality, "good");
  assert.equal(assessGpsQuality(75, 2).quality, "medium");
  assert.equal(assessGpsQuality(250, 2).quality, "insufficient");
});

test("dégrade une position précise lorsqu’elle vieillit", () => {
  assert.equal(assessGpsQuality(6, 30).quality, "good");
  assert.equal(assessGpsQuality(6, 80).quality, "medium");
  assert.equal(assessGpsQuality(6, 121).quality, "stale");
  assert.equal(assessGpsQuality(6, 121).usableForPreciseCalculations, false);
});

test("refuse une précision ou un âge invalide", () => {
  assert.equal(assessGpsQuality(null, 1).quality, "unavailable");
  assert.equal(assessGpsQuality(5, null).quality, "unavailable");
  assert.equal(assessGpsQuality(Number.NaN, 1).quality, "unavailable");
});

test("formate l’âge de position sans fausse précision", () => {
  assert.equal(formatPositionAge(.3), "à l’instant");
  assert.equal(formatPositionAge(12.3), "12 s");
  assert.equal(formatPositionAge(75), "1 min 15");
});
