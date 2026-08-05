import test from "node:test";
import assert from "node:assert/strict";
import { feetPerMinuteToMetersPerSecond, knotsToMetersPerSecond, metersPerSecondToFeetPerMinute } from "../../app/lib/aviation/units.ts";
import { bearingDegrees, closestApproach, distanceKm } from "../../app/lib/aviation/geometry.ts";
import { normalizeModeS, normalizeRegistration, parseCallsign } from "../../app/lib/aviation/callsign.ts";
import { findAirline, GENERIC_AIRLINE_LOGO } from "../../app/data/airlines.ts";
import { escapeHtml } from "../../app/lib/security/escapeHtml.ts";
import { detectRemarkable } from "../../app/lib/aviation/remarkable.ts";
import { identifyNationalAsset } from "../../app/lib/nationalAssetIdentification.ts";
import { evaluateDroneFlight } from "../../app/lib/droneDecision.ts";
import { adsbFiPointUrl } from "../../app/lib/aviation/providers/adsbFi.ts";

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
  assert.equal(detectRemarkable({ aircraftType: "DH8D", callsign: "AFR123" })[0]?.label, "Dash 8");
  assert.equal(detectRemarkable({ aircraftType: "DH8D", callsign: "AFR123" })[0]?.confidence, "confirmed");
  assert.equal(detectRemarkable({ aircraftType: "DH8D", callsign: "MILAN74" })[0]?.confidence, "probable");
  assert.equal(detectRemarkable({ callsign: "BENGALE2" })[0]?.label, "Dash Sécurité Civile");
  assert.equal(detectRemarkable({ aircraftType: "AT8T", description: "AIR TRACTOR AT-802F FIRE BOSS" })[0]?.key, "fire-boss");
});

test("sépare le type confirmé de l'appartenance probable à la Sécurité civile", () => {
  const civilDash = identifyNationalAsset({ aircraftType: "DH8D", callsign: "BENGALE2" });
  assert.equal(civilDash.badge, "DASH SÉCURITÉ CIVILE");
  assert.equal(civilDash.confidence, "probable");

  const airlineDash = identifyNationalAsset({ aircraftType: "DH8D", callsign: "AFR123" });
  assert.equal(airlineDash.badge, "DASH 8");
  assert.equal(airlineDash.confidence, "confirmed");

  const dragon = identifyNationalAsset({ callsign: "DRAGON33", aircraftType: "EC45" });
  assert.equal(dragon.confidence, "probable");

  const fireBoss = identifyNationalAsset({ registration: "LX-AFI", aircraftType: "AT8T" });
  assert.equal(fireBoss.badge, "FIRE BOSS — RENFORT FEUX");
  assert.equal(fireBoss.operator, "Aquarius Aerial Firefighting");
  assert.equal(fireBoss.confidence, "confirmed");

  for (const registration of ["LX-AFA", "LX-AFB", "LX-AFC", "LX-AFF", "LX-AFG", "LX-AFH", "LX-AFI", "LX-AFJ"]) {
    const hiredFireBoss = identifyNationalAsset({ registration });
    assert.equal(hiredFireBoss.badge, "FIRE BOSS — RENFORT FEUX");
    assert.equal(hiredFireBoss.probableMission, null);
  }

  const genericAirTractor = identifyNationalAsset({ aircraftType: "AT8T" });
  assert.equal(genericAirTractor.badge, "FIRE BOSS — LUTTE FEUX");
  assert.equal(genericAirTractor.confidence, "probable");
  assert.equal(genericAirTractor.probableMission, null);
});

test("la décision drone emploie les trois libellés opérationnels prévus", () => {
  const decision = evaluateDroneFlight({ hasPosition: true, requestedHeightM: 60, zones: [], aerodromeDistanceKm: null, restrictionsChecked: true, weatherAvailable: true, gustKnots: 8, visibilityKm: 10 });
  assert.equal(decision.label, "VOL POSSIBLE");
  assert.equal(decision.checkReasons.length, 0);
  assert.ok(decision.positiveReasons.length > 0);
});

test("construit l’URL publique adsb.fi sans clé ni abonnement", () => {
  assert.equal(adsbFiPointUrl({ latitude: 44.8378, longitude: -0.5792, radiusNm: 25 }), "https://opendata.adsb.fi/api/v3/lat/44.8378/lon/-0.5792/dist/25");
});
