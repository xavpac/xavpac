import test from "node:test";
import assert from "node:assert/strict";
import { extractSofiaNotams, formatSofiaCoordinate, parseSofiaCoordinate } from "../../app/lib/aviation/sofiaNotams.ts";

test("convertit les coordonnées GPS dans le format attendu par SOFIA", () => {
  assert.equal(formatSofiaCoordinate(46.48, "latitude"), "4629N");
  assert.equal(formatSofiaCoordinate(5.1, "longitude"), "00506E");
  assert.equal(formatSofiaCoordinate(-0.5792, "longitude"), "00035W");
  assert.deepEqual(parseSofiaCoordinate("4629N00506E"), [46 + 29 / 60, 5.1]);
});

test("déduplique, traduit et classe les NOTAM officiels autour du point", () => {
  const notam = {
    id: "42", nof: "LFFA", series: "A", number: 12, year: 26, itemA: "LFMM",
    startValidity: "2026-07-27T10:00:00Z", endValidity: "2026-07-27T18:00:00Z",
    itemE: "UNMANNED ACFT ACT", multiLanguage: { itemE: "ACTIVITE DE DRONES" },
    coordinates: "4629N00506E", radius: 5,
    qLine: { code23: "WU", code45: "LW", lower: 0, upper: 10 }
  };
  const result = extractSofiaNotams({ nested: [notam, notam] }, [46.48, 5.1], new Date("2026-07-27T14:00:00Z"));
  assert.equal(result.length, 1);
  assert.equal(result[0].reference, "LFFA-A0012/26");
  assert.equal(result[0].category, "Aéronefs sans pilote / drones");
  assert.equal(result[0].translationSource, "sofia");
  assert.equal(result[0].frenchText, "ACTIVITE DE DRONES");
  assert.equal(result[0].impactsPoint, true);
  assert.equal(result[0].activeNow, true);
});

test("classe les NOTAM par proximité avant leur statut temporel", () => {
  const common = {
    nof: "LFFA", series: "A", year: 26, itemA: "LFMM", itemE: "RWY CLSD",
    radius: 0, qLine: { code23: "FA", code45: "LC", lower: 0, upper: 10 }
  };
  const result = extractSofiaNotams({ values: [
    { ...common, id: "far-active", number: 1, coordinates: "4700N00506E", startValidity: "2026-07-27T10:00:00Z", endValidity: "2026-07-27T18:00:00Z" },
    { ...common, id: "near-upcoming", number: 2, coordinates: "4630N00506E", startValidity: "2026-07-28T10:00:00Z", endValidity: "2026-07-28T18:00:00Z" }
  ] }, [46.48, 5.1], new Date("2026-07-27T14:00:00Z"));
  assert.deepEqual(result.map((item) => item.id), ["near-upcoming", "far-active"]);
});
