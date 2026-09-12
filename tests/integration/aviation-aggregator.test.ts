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
    if (url.includes("api.adsbdb.com/v0/aircraft/ABC123")) {
      return new Response(JSON.stringify({ response: { aircraft: { registration: "F-HXYZ", icao_type: "A20N", manufacturer: "Airbus", registered_owner: "Air France" } } }), { status: 200 });
    }
    if (url.includes("api.adsbdb.com/v0/callsign/AFR456")) {
      return new Response(JSON.stringify({ response: { flightroute: { callsign_icao: "AFR456", callsign_iata: "AF456", airline: { name: "Air France", icao: "AFR", iata: "AF" }, origin: { iata_code: "CDG", icao_code: "LFPG", name: "Paris Charles de Gaulle" }, destination: { iata_code: "NCE", icao_code: "LFMN", name: "Nice Côte d’Azur" } } } }), { status: 200 });
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

test("identifie F-HJTB comme hélicoptère SAF même sans route commerciale", async () => {
  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (url.includes("api.adsbdb.com/v0/aircraft/39A661")) {
      return new Response(JSON.stringify({ response: { aircraft: {
        type: "Squirrel AS.350 B3",
        icao_type: "AS50",
        manufacturer: "Eurocopter",
        mode_s: "39A661",
        registration: "F-HJTB",
        registered_owner: "SAF Helicopteres"
      } } }), { status: 200 });
    }
    if (url.includes("api.adsbdb.com/v0/callsign/CONDORA")) return new Response("", { status: 404 });
    if (url.includes("api.planespotters.net")) return new Response(JSON.stringify({ photos: [] }), { status: 200 });
    throw new Error(`Appel inattendu: ${url}`);
  }) as typeof fetch;

  const result = await enrichAircraft({ modeS: "39a661", callsign: "CONDORA", positionSource: "adsb_icao" });
  assert.equal(result.modeS, "39A661");
  assert.equal(result.rawCallsign, "CONDORA");
  assert.equal(result.registration, "F-HJTB");
  assert.equal(result.manufacturer, "Airbus Helicopters");
  assert.equal(result.aircraftModel, "H125 / AS350 B3 Écureuil");
  assert.equal(result.icaoTypeCode, "AS50");
  assert.equal(result.aircraftOperator, "SAF Hélicoptères");
  assert.equal(result.aircraftCategory, "helicopter");
  assert.equal(result.identityStatus, "complete");
  assert.equal(result.routeConfidence, "unavailable");
  assert.ok(result.identitySources.some((source) => source.includes("Référentiel XavPac vérifié")));
});

test("complète une identité absente dans ADSBDB avec HexDB", async () => {
  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (url.includes("api.adsbdb.com/v0/aircraft/C0FFEE")) {
      return new Response(JSON.stringify({ response: { aircraft: "unknown aircraft" } }), { status: 200 });
    }
    if (url.includes("hexdb.io/api/v1/aircraft/C0FFEE")) {
      return new Response(JSON.stringify({
        ModeS: "C0FFEE",
        Registration: "C-GXAV",
        Manufacturer: "Bombardier",
        ICAOTypeCode: "CL35",
        Type: "Challenger 350",
        RegisteredOwners: "XavPac Aviation"
      }), { status: 200 });
    }
    if (url.includes("api.planespotters.net")) return new Response(JSON.stringify({ photos: [] }), { status: 200 });
    throw new Error(`Appel inattendu: ${url}`);
  }) as typeof fetch;

  const result = await enrichAircraft({ modeS: "c0ffee", callsign: null, positionSource: "adsb_icao" });
  assert.equal(result.registration, "C-GXAV");
  assert.equal(result.manufacturer, "Bombardier");
  assert.equal(result.aircraftModel, "Challenger 350");
  assert.equal(result.icaoTypeCode, "CL35");
  assert.equal(result.aircraftOperator, "XavPac Aviation");
  assert.equal(result.identityStatus, "complete");
  assert.ok(result.identitySources.includes("HexDB"));
});

test("utilise HexDB en complément sans écraser les données du flux live", async () => {
  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (url.includes("api.adsbdb.com/v0/aircraft/D1AEC7")) {
      return new Response(JSON.stringify({ response: { aircraft: "unknown aircraft" } }), { status: 200 });
    }
    if (url.includes("api.adsbdb.com/v0/aircraft/F-LIVE")) return new Response("", { status: 404 });
    if (url.includes("hexdb.io/api/v1/aircraft/D1AEC7")) {
      return new Response(JSON.stringify({
        ModeS: "D1AEC7",
        Registration: "G-WRNG",
        Manufacturer: "Airbus",
        ICAOTypeCode: "B738",
        Type: "Boeing 737-800",
        RegisteredOwners: "Wrong Air"
      }), { status: 200 });
    }
    if (url.includes("api.planespotters.net")) return new Response(JSON.stringify({ photos: [] }), { status: 200 });
    throw new Error(`Appel inattendu: ${url}`);
  }) as typeof fetch;

  const result = await enrichAircraft({
    modeS: "d1aec7",
    registration: "F-LIVE",
    aircraftType: "A20N",
    description: "Airbus A320neo",
    operator: "Air France",
    positionSource: "adsb.fi"
  });
  assert.equal(result.registration, "F-LIVE");
  assert.equal(result.manufacturer, "Airbus");
  assert.equal(result.aircraftModel, "Airbus A320neo");
  assert.equal(result.icaoTypeCode, "A20N");
  assert.equal(result.aircraftOperator, "Air France");
  assert.ok(result.identitySources.includes("HexDB"));
  assert.ok(result.identitySources.includes("adsb.fi"));
});

test("retente ADSBDB par immatriculation quand le Mode-S est inconnu", async () => {
  const requests: string[] = [];
  globalThis.fetch = (async (input) => {
    const url = String(input);
    requests.push(url);
    if (url.includes("api.adsbdb.com/v0/aircraft/A0B1C2")) {
      return new Response(JSON.stringify({ response: { aircraft: "unknown aircraft" } }), { status: 200 });
    }
    if (url.includes("api.adsbdb.com/v0/aircraft/N123XP")) {
      return new Response(JSON.stringify({ response: { aircraft: {
        registration: "N123XP",
        manufacturer: "Cessna",
        icao_type: "C172",
        type: "172 Skyhawk",
        registered_owner: "XavPac Flying Club"
      } } }), { status: 200 });
    }
    if (url.includes("api.planespotters.net")) return new Response(JSON.stringify({ photos: [] }), { status: 200 });
    throw new Error(`Appel inattendu: ${url}`);
  }) as typeof fetch;

  const result = await enrichAircraft({ modeS: "a0b1c2", registration: "N123XP", callsign: null });
  assert.equal(result.registration, "N123XP");
  assert.equal(result.aircraftModel, "172 Skyhawk");
  assert.equal(result.aircraftOperator, "XavPac Flying Club");
  assert.equal(result.identityStatus, "complete");
  assert.ok(requests.some((url) => url.includes("aircraft/A0B1C2")));
  assert.ok(requests.some((url) => url.includes("aircraft/N123XP")));
  assert.ok(!requests.some((url) => url.includes("hexdb.io")));
});

test("reconnaît au moins la compagnie grâce au callsign", async () => {
  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (url.includes("api.adsbdb.com/v0/aircraft/BAD222")) {
      return new Response(JSON.stringify({ response: { aircraft: "unknown aircraft" } }), { status: 200 });
    }
    if (url.includes("api.adsbdb.com/v0/callsign/AFR999")) return new Response("", { status: 404 });
    if (url.includes("hexdb.io/api/v1/aircraft/BAD222")) return new Response("", { status: 404 });
    if (url.includes("api.planespotters.net")) return new Response(JSON.stringify({ photos: [] }), { status: 200 });
    throw new Error(`Appel inattendu: ${url}`);
  }) as typeof fetch;

  const result = await enrichAircraft({ modeS: "bad222", callsign: "AFR999" });
  assert.equal(result.aircraftOperator, "Air France");
  assert.equal(result.aircraftCategory, "airliner");
  assert.equal(result.identityStatus, "partial");
  assert.ok(result.identitySources.includes("Référentiel compagnies XavPac"));
});
