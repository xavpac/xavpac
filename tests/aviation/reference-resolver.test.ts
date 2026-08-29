import assert from "node:assert/strict";
import test from "node:test";
import { detectReferenceDevice, resolveReference, type ReferenceGpsFix } from "../../app/lib/referenceResolver.ts";

const home: [number, number] = [46.31, 4.83];
const milan: [number, number] = [45.46, 9.19];
const gps = (position: [number, number], usable = true): ReferenceGpsFix => ({
  position,
  accuracyMeters: usable ? 8 : 240,
  timestampMs: Date.now(),
  quality: usable ? "excellent" : "insufficient",
  usable
});

test("détecte iPhone, Android et iPad en mode bureau comme mobiles", () => {
  assert.equal(detectReferenceDevice({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", maxTouchPoints: 5 }), "mobile");
  assert.equal(detectReferenceDevice({ userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9)", maxTouchPoints: 5 }), "mobile");
  assert.equal(detectReferenceDevice({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)", maxTouchPoints: 5 }), "mobile");
  assert.equal(detectReferenceDevice({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6)", maxTouchPoints: 0 }), "desktop");
});

test("utilise MOI automatiquement sur smartphone même loin de HOME", () => {
  const result = resolveReference({ device: "mobile", home, gps: gps(milan) });
  assert.equal(result.kind, "moi");
  assert.deepEqual(result.position, milan);
  assert.equal(result.fallbackFrom, null);
});

test("conserve HOME par défaut sur Mac", () => {
  const result = resolveReference({ device: "desktop", home, gps: gps(milan) });
  assert.equal(result.kind, "home");
  assert.deepEqual(result.position, home);
});

test("une sélection volontaire de HOME reste possible sur smartphone", () => {
  const result = resolveReference({ device: "mobile", preference: "home", home, gps: gps(milan) });
  assert.equal(result.kind, "home");
  assert.deepEqual(result.position, home);
});

test("conserve la dernière position GPS valide lors d'une perte temporaire", () => {
  const result = resolveReference({ device: "mobile", home, gps: gps(milan, false), lastValidGps: gps(milan) });
  assert.equal(result.kind, "moi");
  assert.deepEqual(result.position, milan);
  assert.equal(result.usedLastValidGps, true);
});

test("HOME ne sert que de secours mobile sans position GPS connue", () => {
  const result = resolveReference({ device: "mobile", home, gps: null });
  assert.equal(result.kind, "home");
  assert.equal(result.fallbackFrom, "moi");
});

test("MISSION explicite domine les valeurs par défaut", () => {
  const mission: [number, number] = [43.3, 5.4];
  const result = resolveReference({ device: "desktop", preference: "mission", explicitPosition: mission, home, gps: gps(milan) });
  assert.equal(result.kind, "mission");
  assert.deepEqual(result.position, mission);
});
