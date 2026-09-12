import test from "node:test";
import assert from "node:assert/strict";
import { aircraftCoverageRadius, summarizeAircraftProximity } from "../../app/lib/aviation/proximitySummary.ts";

test("surveille au moins 20 kilomètres sans réduire un rayon plus large", () => {
  assert.equal(aircraftCoverageRadius(10), 20);
  assert.equal(aircraftCoverageRadius(20), 20);
  assert.equal(aircraftCoverageRadius(50), 50);
});

test("compte cumulativement les appareils à 10, 15 et 20 kilomètres", () => {
  const summary = summarizeAircraftProximity([
    { callsign: "NEAR1", distance: 2.4 },
    { callsign: "TEN", distance: 10 },
    { callsign: "MID", distance: 12.8 },
    { callsign: "FIFTEEN", distance: 15 },
    { callsign: "TWENTY", distance: 20 },
    { callsign: "FAR", distance: 20.1 }
  ]);

  assert.equal(summary.nearestLabel, "NEAR1");
  assert.equal(summary.nearestDistanceKm, 2.4);
  assert.equal(summary.within10Km, 2);
  assert.equal(summary.within15Km, 4);
  assert.equal(summary.within20Km, 5);
});

test("ignore les distances invalides et conserve un état de veille explicite", () => {
  assert.deepEqual(summarizeAircraftProximity([
    { callsign: "NEG", distance: -1 },
    { callsign: "BAD", distance: Number.NaN }
  ]), {
    nearestLabel: null,
    nearestDistanceKm: null,
    within10Km: 0,
    within15Km: 0,
    within20Km: 0
  });
});
