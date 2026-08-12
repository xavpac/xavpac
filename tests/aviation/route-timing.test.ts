import assert from "node:assert/strict";
import test from "node:test";
import { estimateRouteTiming } from "../../app/lib/aviation/routeTiming.ts";

const nowMs = Date.parse("2026-08-12T12:00:00.000Z");

test("estime les heures de départ et d'arrivée à partir de la route et de la vitesse", () => {
  const result = estimateRouteTiming({
    origin: [46, 4],
    destination: [46, 6],
    current: [46, 5],
    velocityMetersPerSecond: 200,
    onGround: false,
    nowMs
  });

  assert.ok(result.estimatedDepartureAt);
  assert.ok(result.estimatedArrivalAt);
  assert.ok((result.progress ?? 0) > 49 && (result.progress ?? 0) < 51);
  assert.ok((result.estimatedDepartureAt?.getTime() ?? nowMs) < nowMs);
  assert.ok((result.estimatedArrivalAt?.getTime() ?? nowMs) > nowMs);
});

test("n'invente aucun horaire lorsque la vitesse ou la route manque", () => {
  const withoutSpeed = estimateRouteTiming({
    origin: [46, 4], destination: [46, 6], current: [46, 5],
    velocityMetersPerSecond: null, onGround: false, nowMs
  });
  assert.equal(withoutSpeed.estimatedDepartureAt, null);
  assert.equal(withoutSpeed.estimatedArrivalAt, null);

  const withoutRoute = estimateRouteTiming({
    origin: null, destination: null, current: [46, 5],
    velocityMetersPerSecond: 200, onGround: false, nowMs
  });
  assert.equal(withoutRoute.progress, null);
  assert.equal(withoutRoute.remainingKm, null);
});

test("n'affiche pas d'estimation horaire pour un avion au sol", () => {
  const result = estimateRouteTiming({
    origin: [46, 4], destination: [46, 6], current: [46, 5],
    velocityMetersPerSecond: 15, onGround: true, nowMs
  });
  assert.equal(result.estimatedDepartureAt, null);
  assert.equal(result.estimatedArrivalAt, null);
});
