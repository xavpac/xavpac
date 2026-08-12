import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeLightningTrend,
  lightningActivityLabel,
  lightningAgeBand,
  lightningBearing,
  lightningCardinalDirection,
  lightningMapUrl,
  summarizeLightning,
  type LightningStrike
} from "../../app/lib/weather/lightning.ts";

const HOME: [number, number] = [46.345497, 4.976824];
const NOW = Date.parse("2026-08-12T12:00:00.000Z");

function strike(id: string, distanceNorthKm: number, ageMinutes: number): LightningStrike {
  const occurredAtUtc = new Date(NOW - ageMinutes * 60_000).toISOString();
  return {
    id,
    latitude: HOME[0] + distanceNorthKm / 111.2,
    longitude: HOME[1],
    occurredAtUtc,
    occurredAtLocal: occurredAtUtc,
    source: "Fixture autorisée",
    retrievedAt: new Date(NOW).toISOString()
  };
}

test("centre la carte des impacts de foudre sur le point sélectionné", () => {
  const url = lightningMapUrl([46.306, 4.831]);
  assert.match(url, /^https:\/\/maps\.blitzortung\.org\/fr\/\?/);
  assert.match(url, /Cookies=0/);
  assert.match(url, /#9\/46\.30600\/4\.83100$/);
});

test("calcule les rayons HOME de manière cumulative", () => {
  const summary = summarizeLightning([
    strike("one", 1, 2),
    strike("two", 2.5, 8),
    strike("three", 4.5, 20),
    strike("four", 8, 40),
    strike("old", 1, 90)
  ], HOME, 60, NOW);
  assert.equal(summary.count, 4);
  assert.equal(summary.within2Km, 1);
  assert.equal(summary.within3Km, 2);
  assert.equal(summary.within5Km, 3);
  assert.equal(summary.within10Km, 4);
  assert.equal(summary.mainSector, "nord");
});

test("refuse de conclure une tendance avec seulement un ou deux impacts", () => {
  const result = analyzeLightningTrend([strike("one", 5, 5), strike("two", 6, 15)], HOME, NOW);
  assert.equal(result.label, "Tendance indéterminée");
  assert.equal(result.confidence, "indéterminée");
});

test("détecte un rapprochement cohérent sur trois fenêtres suffisamment remplies", () => {
  const impacts = [
    strike("a1", 12, 25), strike("a2", 11, 24), strike("a3", 10, 23),
    strike("b1", 8, 15), strike("b2", 7, 14), strike("b3", 6, 13),
    strike("c1", 4, 5), strike("c2", 3, 4), strike("c3", 2, 3)
  ];
  const result = analyzeLightningTrend(impacts, HOME, NOW);
  assert.equal(result.label, "Activité se rapprochant");
  assert.equal(result.confidence, "faible");
});

test("l’âge et l’intensité reposent sur des seuils documentés", () => {
  assert.equal(lightningAgeBand(4.9), "under-5");
  assert.equal(lightningAgeBand(15), "15-30");
  assert.equal(lightningAgeBand(61), "older");
  assert.equal(lightningActivityLabel(0), "Aucune activité récente");
  assert.equal(lightningActivityLabel(12), "Activité soutenue");
});

test("calcule un azimut et une direction lisibles", () => {
  const north = strike("north", 4, 1);
  assert.ok(lightningBearing(HOME, north) < 1 || lightningBearing(HOME, north) > 359);
  assert.equal(lightningCardinalDirection(lightningBearing(HOME, north)), "nord");
});

test("revient sur la France sans inventer une position absente", () => {
  assert.match(lightningMapUrl(null), /#5\/46\.60335\/1\.88833$/);
});
