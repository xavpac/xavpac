import assert from "node:assert/strict";
import test from "node:test";
import {
  isCoordinatePair,
  migrateXavPacStorage,
  normalizeStoredManualObserver,
  normalizeStringArray,
  parseStoredJson,
  safeGetItem,
  safeSetItem,
  XAVPAC_STORAGE_KEYS,
  XAVPAC_STORAGE_VERSION,
  XAVPAC_STORAGE_VERSION_KEY,
  type StorageLike
} from "../../app/lib/safeStorage.ts";
import { normalizeObservation } from "../../app/lib/aviation/observations.ts";
import { enterFullscreenIfAvailable, exitFullscreenIfActive, isFullscreenActive } from "../../app/lib/fullscreen.ts";

class MemoryStorage implements StorageLike {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

test("ignore un JSON local invalide sans lever d’exception", () => {
  assert.equal(parseStoredJson("{cassé"), null);
  assert.deepEqual(normalizeStringArray(parseStoredJson("{cassé")), []);
});

test("migre un ancien objet de favoris vers une liste saine", () => {
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  local.setItem(XAVPAC_STORAGE_KEYS.favorites, JSON.stringify({ favorites: ["abc123", 42, "abc123", " def456 "] }));
  session.setItem(XAVPAC_STORAGE_KEYS.manualObserver, JSON.stringify([48, 2]));
  const result = migrateXavPacStorage(local, session);
  assert.deepEqual(result, { migrated: true, version: XAVPAC_STORAGE_VERSION });
  assert.deepEqual(JSON.parse(local.getItem(XAVPAC_STORAGE_KEYS.favorites) ?? "[]"), ["abc123", "def456"]);
  assert.equal(session.getItem(XAVPAC_STORAGE_KEYS.manualObserver), null);
  assert.equal(local.getItem(XAVPAC_STORAGE_VERSION_KEY), String(XAVPAC_STORAGE_VERSION));
});

test("supprime un HOME malformé et conserve un HOME exact", () => {
  const invalid = new MemoryStorage();
  invalid.setItem(XAVPAC_STORAGE_KEYS.savedHome, JSON.stringify([46.2, "4.8"]));
  migrateXavPacStorage(invalid);
  assert.equal(invalid.getItem(XAVPAC_STORAGE_KEYS.savedHome), null);

  const valid = new MemoryStorage();
  valid.setItem(XAVPAC_STORAGE_KEYS.savedHome, JSON.stringify([46.346, 4.977]));
  migrateXavPacStorage(valid);
  assert.equal(isCoordinatePair(JSON.parse(valid.getItem(XAVPAC_STORAGE_KEYS.savedHome) ?? "null")), true);
});

test("conserve un point d’observation volontaire pendant la navigation", () => {
  assert.deepEqual(normalizeStoredManualObserver([46.306, 4.831]), {
    position: [46.306, 4.831],
    reference: "manual"
  });
  assert.deepEqual(normalizeStoredManualObserver({ position: [46.346, 4.977], reference: "home" }), {
    position: [46.346, 4.977],
    reference: "home"
  });
  assert.equal(normalizeStoredManualObserver({ position: [46.3, "4.8"], reference: "manual" }), null);
  assert.equal(normalizeStoredManualObserver({ position: [46.3, 4.8], reference: "moi" }), null);
});

test("un stockage Safari indisponible ne fait jamais planter XavPac", () => {
  const blocked: StorageLike = {
    getItem() { throw new Error("SecurityError"); },
    setItem() { throw new Error("QuotaExceededError"); },
    removeItem() { throw new Error("SecurityError"); }
  };
  assert.equal(safeGetItem(blocked, "clé"), null);
  assert.equal(safeSetItem(blocked, "clé", "valeur"), false);
  assert.doesNotThrow(() => migrateXavPacStorage(blocked));
});

test("filtre une ancienne observation corrompue et complète les champs optionnels", () => {
  assert.equal(normalizeObservation({ modeS: "abc" }), null);
  const normalized = normalizeObservation({
    modeS: "abc123",
    observedAt: "2026-08-09T10:00:00.000Z",
    latitude: 46.3,
    longitude: 4.8,
    routeConfidence: "ancienne-valeur"
  });
  assert.ok(normalized);
  assert.equal(normalized.routeConfidence, "unavailable");
  assert.equal(normalized.id, "abc123:2026-08-09T10:00:00.000Z");
  assert.equal(normalized.photoUrl, "");
});

test("le plein écran CSS prend le relais si Safari refuse l’API native", async () => {
  const rejectedElement = { requestFullscreen: async () => { throw new Error("NotAllowedError"); } } as unknown as HTMLElement;
  assert.equal(await enterFullscreenIfAvailable(rejectedElement), "css");
  assert.equal(await enterFullscreenIfAvailable({} as HTMLElement), "css");
});

test("la sortie plein écran reste sûre avec une API compatible", async () => {
  let exited = false;
  const fakeDocument = {
    fullscreenElement: {},
    exitFullscreen: async () => { exited = true; }
  } as unknown as Document;
  assert.equal(isFullscreenActive(fakeDocument), true);
  assert.equal(await exitFullscreenIfActive(fakeDocument), true);
  assert.equal(exited, true);
});
