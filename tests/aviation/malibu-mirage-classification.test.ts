import assert from "node:assert/strict";
import test from "node:test";
import { classifyAircraftVisual } from "../../app/lib/aviation/aircraftVisual.ts";

test("OE-KGC Piper PA-46 Malibu Mirage n'est pas militaire", () => {
  const result = classifyAircraftVisual("OE-KGC", "PA-46 350P Malibu Mirage", "Private");
  assert.equal(result.kind, "light");
});

test("une ancienne catégorie militaire erronée ne surclasse pas le Piper Malibu", () => {
  const result = classifyAircraftVisual("OE-KGC", "Piper PA46", "Malibu Mirage", "military");
  assert.equal(result.kind, "light");
});

test("les vrais Dassault Mirage militaires restent classés militaires", () => {
  assert.equal(classifyAircraftVisual("Mirage 2000D", "Armée de l'air").kind, "military");
  assert.equal(classifyAircraftVisual("Dassault Mirage F1").kind, "military");
  assert.equal(classifyAircraftVisual("Rafale", "Armée de l'air").kind, "military");
});

test("le mot Mirage seul ne suffit pas à déclencher une alerte", () => {
  assert.notEqual(classifyAircraftVisual("Mirage", "Private").kind, "military");
});
