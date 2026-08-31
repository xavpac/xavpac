import assert from "node:assert/strict";
import test from "node:test";
import { describeDfciCode, recognizeDfciCodes } from "../../app/lib/fire/dfci.ts";

test("reconnaît et normalise les formats DFCI courants", () => {
  const matches = recognizeDfciCodes("Départ pour DFCI KD-58 A8, accès par KD58A8.");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].normalized, "KD 58 A 8");
  assert.equal(describeDfciCode(matches[0]), "secteur KD • maille 58 • sous-maille A • cellule 8");
});

test("ne transforme pas des coordonnées en code DFCI", () => {
  assert.deepEqual(recognizeDfciCodes("Position 43.61, 3.87"), []);
});
