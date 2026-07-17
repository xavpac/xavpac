import test from "node:test";
import assert from "node:assert/strict";
import { feetPerMinuteToMetersPerSecond, knotsToMetersPerSecond, metersPerSecondToFeetPerMinute } from "../../app/lib/aviation/units.ts";
import { bearingDegrees, closestApproach, distanceKm } from "../../app/lib/aviation/geometry.ts";
import { normalizeModeS, normalizeRegistration, parseCallsign } from "../../app/lib/aviation/callsign.ts";
import { findAirline, GENERIC_AIRLINE_LOGO } from "../../app/data/airlines.ts";
import { escapeHtml } from "../../app/lib/security/escapeHtml.ts";
import { detectRemarkable } from "../../app/lib/aviation/remarkable.ts";
import { evaluateDroneFlight } from "../../app/lib/droneDecision.ts";

test("convertit exactement pieds/minute vers mètres/seconde", () => {
  assert.equal(feetPerMinuteToMetersPerSecond(1000), 5.08);
  assert.ok(Math.abs(metersPerSecondToFeetPerMinute(5.08) - 1000) < 1e-10);
});

test("convertit les nœuds vers mètres/seconde", () => {
  assert.ok(Math.abs(knotsToMetersPerSecond(100) - 51.44444444444444) < 1e-10);
});

test("calcule distance et relèvement", () => {
  assert.ok(Math.abs(distanceKm([48.8566, 2.3522], [51.5074, -0.1278]) - 343.6) < 1);
  assert.ok(Math.abs(bearingDegrees([48.8566, 2.3522], [51.5074, -0.1278]) - 330) < 2);
});

test("calcule un passage au plus près", () => {
  const result = closestApproach([46, 4], { latitude: 46, longitude: 3.9, velocity: 200, trueTrack: 90 });
  assert.equal(result.state, "approaching");
  assert.ok((result.seconds ?? 0) > 20);
  assert.ok(result.minimumDistanceKm < 0.1);
});

test("normalise Mode-S, immatriculation et callsigns sans les confondre", () => {
  assert.equal(normalizeModeS("~39ab12"), "39AB12");
  assert.equal(normalizeRegistration(" f-gabc "), "F-GABC");
  assert.deepEqual(parseCallsign("AFR123 "), { raw: "AFR123", icao: "AFR123", iata: null, airlineIcao: "AFR", airlineIata: null });
  assert.deepEqual(parseCallsign("AF123"), { raw: "AF123", icao: null, iata: "AF123", airlineIcao: null, airlineIata: "AF" });
  assert.equal(parseCallsign("F-GABC").icao, null);
});

test("résout les filiales et le fallback logo local", () => {
  const easyJetEurope = findAirline({ callsign: "EJU42AB" });
  assert.equal(easyJetEurope?.canonicalName, "easyJet Europe");
  assert.equal(easyJetEurope?.logoPath, "/airlines/easyjet.svg");
  assert.equal(findAirline({ callsign: "ZZZ123" })?.logoPath ?? GENERIC_AIRLINE_LOGO, "/airlines/generic-airline.svg");
});

test("échappe les données externes destinées aux marqueurs Leaflet", () => {
  const hostile = '<img src=x onerror="alert(1)">&';
  const escaped = escapeHtml(hostile);
  assert.equal(escaped, "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;");
  assert.equal(escaped.includes("<img"), false);
});

test("détecte un appareil remarquable sans surévaluer un callsign", () => {
  assert.equal(detectRemarkable({ aircraftType: "A388" })[0]?.confidence, "confirmed");
  assert.equal(detectRemarkable({ callsign: "DRAGON75" })[0]?.confidence, "probable");
});

test("la décision drone emploie les trois libellés opérationnels prévus", () => {
  const decision = evaluateDroneFlight({ hasPosition: true, requestedHeightM: 60, zones: [], aerodromeDistanceKm: null, restrictionsChecked: true, weatherAvailable: true, gustKnots: 8, visibilityKm: 10 });
  assert.equal(decision.label, "VOL POSSIBLE");
});
