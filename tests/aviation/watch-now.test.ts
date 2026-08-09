import assert from "node:assert/strict";
import test from "node:test";
import { rankWatchNow, type WatchNowCandidate } from "../../app/lib/aviation/watchNow.ts";

function candidate(overrides: Partial<WatchNowCandidate>): WatchNowCandidate {
  return {
    id: "abc123",
    callsign: "TEST01",
    distanceKm: 40,
    altitudeMeters: 3000,
    onGround: false,
    isNational: false,
    isRemarkable: false,
    isMilitary: false,
    isRare: false,
    estimatedSecondsToHomePassage: null,
    ...overrides
  };
}

test("priorise un moyen national avant un appareil simplement proche", () => {
  const ranked = rankWatchNow([
    candidate({ id: "close", distanceKm: 4 }),
    candidate({ id: "national", distanceKm: 80, isNational: true })
  ]);
  assert.deepEqual(ranked.map((item) => item.id), ["national", "close"]);
});

test("limite À regarder maintenant à trois appareils en vol", () => {
  const ranked = rankWatchNow([
    candidate({ id: "ground", onGround: true, isNational: true }),
    candidate({ id: "one", isRemarkable: true }),
    candidate({ id: "two", isMilitary: true }),
    candidate({ id: "three", isRare: true }),
    candidate({ id: "four", distanceKm: 3 })
  ], 8);
  assert.deepEqual(ranked.map((item) => item.id), ["one", "two", "three"]);
});

test("n'invente aucune recommandation sans signal pertinent", () => {
  assert.deepEqual(rankWatchNow([candidate({ distanceKm: 60, altitudeMeters: 4000 })]), []);
});
