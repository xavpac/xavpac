import test from "node:test";
import assert from "node:assert/strict";
import { enrichAircraft } from "../../app/lib/aviation/enrichment.ts";

const originalFetch = globalThis.fetch;

test.afterEach(() => { globalThis.fetch = originalFetch; });

test("enrichit par Mode-S sans callsign et conserve une immatriculation avec tiret", async () => {
  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (url.includes("api.adsbdb.com/v0/aircraft/39AB12")) {
      return new Response(JSON.stringify({ response: { aircraft: { registration: "F-GABC", icao_type: "A320", manufacturer: "Airbus", registered_owner: "Air France" } } }), { status: 200 });
    }
    if (url.includes("api.planespotters.net")) return new Response(JSON.stringify({ photos: [] }), { status: 200 });
    throw new Error(`Appel inattendu: ${url}`);
  }) as typeof fetch;

  const result = await enrichAircraft({ modeS: "39ab12", registration: "F-GABC", callsign: null, positionSource: "adsb_icao" });
  assert.equal(result.modeS, "39AB12");
  assert.equal(result.registration, "F-GABC");
  assert.equal(result.callsignIcao, null);
  assert.equal(result.flightNumberIata, null);
  assert.equal(result.routeConfidence, "unavailable");
  assert.equal(result.photo.kind, "generic");
  assert.equal(result.logo, "/airlines/air-france.svg");
});

test("retourne une route ADSBDB probable et distingue ICAO de IATA", async () => {
  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (url.includes("api.adsbdb.com/v0/aircraft/ABC123?callsign=AFR456")) {
      return new Response(JSON.stringify({ response: {
        aircraft: { registration: "F-HXYZ", icao_type: "A20N", manufacturer: "Airbus", registered_owner: "Air France" },
        flightroute: { callsign_icao: "AFR456", callsign_iata: "AF456", airline: { name: "Air France", icao: "AFR", iata: "AF" }, origin: { iata_code: "CDG", icao_code: "LFPG", name: "Paris Charles de Gaulle" }, destination: { iata_code: "NCE", icao_code: "LFMN", name: "Nice Côte d’Azur" } }
      } }), { status: 200 });
    }
    if (url.includes("api.planespotters.net")) return new Response(JSON.stringify({ photos: [] }), { status: 200 });
    throw new Error(`Appel inattendu: ${url}`);
  }) as typeof fetch;

  const result = await enrichAircraft({ modeS: "ABC123", callsign: "AFR456", distanceKm: 4 });
  assert.equal(result.callsignIcao, "AFR456");
  assert.equal(result.flightNumberIata, "AF456");
  assert.equal(result.routeLabel, "CDG → NCE");
  assert.equal(result.routeSource, "ADSBDB");
  assert.equal(result.routeConfidence, "probable");
  assert.equal(result.logo, "/airlines/air-france.svg");
  assert.equal(result.routeProvenance.method, "community");
  assert.equal(result.routeProvenance.confidence, "probable");
});
