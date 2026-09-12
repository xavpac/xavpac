import test from "node:test";
import assert from "node:assert/strict";
import { parseHexDbAircraft } from "../../app/lib/aviation/providers/hexdb.ts";

test("normalise une fiche HexDB exploitable", () => {
  assert.deepEqual(parseHexDbAircraft({
    ModeS: "39ab12",
    Registration: "f-hkys",
    Manufacturer: "Airbus",
    ICAOTypeCode: "a339",
    Type: "A330-941",
    RegisteredOwners: "Corsair",
    OperatorFlagCode: "CRL"
  }), {
    modeS: "39AB12",
    registration: "F-HKYS",
    manufacturer: "Airbus",
    icaoTypeCode: "A339",
    aircraftModel: "A330-941",
    registeredOwner: "Corsair",
    operatorFlagCode: "CRL"
  });
});

test("ignore les réponses absentes et les valeurs génériques", () => {
  assert.equal(parseHexDbAircraft({ status: "404", ModeS: "39AB12" }), null);
  assert.equal(parseHexDbAircraft({ ModeS: "39AB13", Registration: "unknown", Type: "N/A" }), null);
  assert.equal(parseHexDbAircraft("unknown aircraft"), null);
});
