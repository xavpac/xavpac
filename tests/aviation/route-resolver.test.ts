import assert from "node:assert/strict";
import test from "node:test";
import { resolveAircraftRoute, type RouteCandidate } from "../../app/lib/aviation/routeResolver.ts";

const airport = (icao: string) => ({ name: icao, municipality: null, iata: null, icao, latitude: null, longitude: null });
const candidate = (overrides: Partial<RouteCandidate>): RouteCandidate => ({
  source: "Source",
  origin: airport("LFPG"),
  destination: airport("LFMN"),
  confidence: "probable",
  method: "community",
  retrievedAt: "2026-08-30T10:00:00.000Z",
  ...overrides
});

test("préfère la confiance à l'ordre des fournisseurs", () => {
  const resolution = resolveAircraftRoute([
    candidate({ source: "Historique", confidence: "inferred", priority: 100 }),
    candidate({ source: "Source temps réel", confidence: "confirmed", priority: 10 })
  ]);
  assert.equal(resolution.selected?.source, "Source temps réel");
});

test("utilise la priorité entre deux candidats de même confiance", () => {
  const resolution = resolveAircraftRoute([
    candidate({ source: "OpenSky", confidence: "inferred", priority: 60 }),
    candidate({ source: "ADSBDB", confidence: "inferred", priority: 90 })
  ]);
  assert.equal(resolution.selected?.source, "ADSBDB");
});

test("ignore une route partielle sans inventer l'autre aéroport", () => {
  const resolution = resolveAircraftRoute([candidate({ destination: null })]);
  assert.equal(resolution.selected, null);
  assert.equal(resolution.candidates.length, 1);
});
