import assert from "node:assert/strict";
import test from "node:test";
import { classifyAzbaSlots, normalizeRtbaCode } from "../../app/lib/aviation/azbaLive.ts";

test("normalise les identifiants RTBA SIA et AIP", () => {
  assert.equal(normalizeRtbaCode("LF R 45 S6.1"), "R45S6.1");
  assert.equal(normalizeRtbaCode("LFR45S5"), "R45S5");
});

test("classe un créneau AZBA actif maintenant", () => {
  const now = Date.parse("2026-10-03T18:00:00Z");
  const result = classifyAzbaSlots([
    { startUtc: "2026-10-03T17:30:00Z", endUtc: "2026-10-03T18:30:00Z" }
  ], now, Date.parse("2026-10-03T12:00:00Z"), Date.parse("2026-10-04T12:00:00Z"));
  assert.equal(result.state, "active");
  assert.equal(result.activeNow, true);
});

test("classe les activations futures sans inventer un statut vert", () => {
  const now = Date.parse("2026-10-03T18:00:00Z");
  const soon = classifyAzbaSlots([
    { startUtc: "2026-10-03T20:00:00Z", endUtc: "2026-10-03T21:00:00Z" }
  ], now, Date.parse("2026-10-03T12:00:00Z"), Date.parse("2026-10-04T12:00:00Z"));
  assert.equal(soon.state, "soon");

  const outsideWindow = classifyAzbaSlots([], now, Date.parse("2026-10-04T00:00:00Z"), Date.parse("2026-10-05T00:00:00Z"));
  assert.equal(outsideWindow.state, "unknown");
});
