import assert from "node:assert/strict";
import test from "node:test";
import { buildDroneReadiness } from "../../app/lib/drone/readiness.ts";

const readyInput = {
  hasPosition: true,
  missionWindowValid: true,
  heightMeters: 60,
  rtbaSeverity: "clear" as const,
  rtbaConfirmed: true,
  rtbaOutsideLocalCoverage: false,
  notamStatus: "success" as const,
  directNotamCount: 0,
  weatherAvailable: true,
  weatherBlocking: false,
  nearbyAircraftCount: 0,
  pilotChecksConfirmed: true
};

test("donne une réponse claire quand les contrôles disponibles sont favorables", () => {
  const result = buildDroneReadiness(readyInput);
  assert.equal(result.tone, "clear");
  assert.equal(result.headline, "AUCUN BLOCAGE DÉTECTÉ");
  assert.equal(result.actions.length, 0);
});

test("demande d'attendre quand l'AZBA ou les NOTAM ne sont pas confirmés", () => {
  const result = buildDroneReadiness({
    ...readyInput,
    rtbaConfirmed: false,
    rtbaOutsideLocalCoverage: true,
    notamStatus: "loading",
    pilotChecksConfirmed: false
  });
  assert.equal(result.tone, "hold");
  assert.equal(result.headline, "NE DÉCOLLEZ PAS ENCORE");
  assert.ok(result.actions.some((action) => /AZBA national/.test(action.label)));
  assert.ok(result.actions.some((action) => /NOTAM officiels/.test(action.label)));
});

test("affiche un arrêt explicite pour une hauteur ou un NOTAM bloquant", () => {
  const result = buildDroneReadiness({ ...readyInput, heightMeters: 140, directNotamCount: 1 });
  assert.equal(result.tone, "stop");
  assert.equal(result.headline, "NE PAS DÉCOLLER");
  assert.equal(result.actions.filter((action) => action.level === "blocking").length, 2);
});
