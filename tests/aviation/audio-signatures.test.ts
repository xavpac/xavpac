import assert from "node:assert/strict";
import test from "node:test";
import { AIRCRAFT_CHANGE_SIGNATURE, NATIONAL_ASSET_SIGNATURE, aircraftChangeSignature, aircraftSoundNature } from "../../app/lib/aviation/audioSignatures.ts";

test("les deux alertes possèdent des signatures sonores distinctes", () => {
  assert.notDeepEqual(NATIONAL_ASSET_SIGNATURE, AIRCRAFT_CHANGE_SIGNATURE);
  assert.equal(AIRCRAFT_CHANGE_SIGNATURE.length, 2);
  assert.equal(NATIONAL_ASSET_SIGNATURE.length, 3);
  assert.ok(NATIONAL_ASSET_SIGNATURE.every((tone) => tone.wave === "triangle"));
});

test("classe et sonorise différemment les principales natures d'aéronefs", () => {
  assert.equal(aircraftSoundNature("SAMU 69", "H145"), "medical");
  assert.equal(aircraftSoundNature("DRAGON 74", "EC145"), "helicopter");
  assert.equal(aircraftSoundNature("D-LZBW", "Zeppelin NT"), "airship");
  assert.equal(aircraftSoundNature("MILAN 73", "DASH 8"), "fire");
  assert.notDeepEqual(aircraftChangeSignature("airship"), aircraftChangeSignature("helicopter"));
  assert.notDeepEqual(aircraftChangeSignature("medical"), aircraftChangeSignature("commercial"));
});

test("le son des moyens nationaux reste plus doux que celui du changement d’avion", () => {
  const nationalPeak = Math.max(...NATIONAL_ASSET_SIGNATURE.map((tone) => tone.peakGain));
  const aircraftPeak = Math.max(...AIRCRAFT_CHANGE_SIGNATURE.map((tone) => tone.peakGain));
  assert.ok(nationalPeak < aircraftPeak);
});
