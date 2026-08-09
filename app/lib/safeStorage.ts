export const XAVPAC_STORAGE_VERSION_KEY = "xavpac-storage-version";
export const XAVPAC_STORAGE_VERSION = 1;

export const XAVPAC_STORAGE_KEYS = {
  favorites: "xavpac-favorites",
  savedHome: "xavpac:saved-observer-home-v1",
  manualObserver: "xavpac:manual-observer",
  droneMission: "xavpac:drone-mission-v1",
  mapStyle: "xavpac:aviation-map-style",
  soundPreference: "xavpac:aviation-sounds",
  observations: "xavpac-spotting-observations-v1",
  aircraftIdentities: "xavpac-aircraft-identities-v2"
} as const;

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type StoredObserverReference = "home" | "manual";
export type StoredManualObserver = {
  position: [number, number];
  reference: StoredObserverReference;
};

export function parseStoredJson(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function isCoordinatePair(value: unknown): value is [number, number] {
  return Array.isArray(value)
    && value.length === 2
    && value.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))
    && value[0] >= -90
    && value[0] <= 90
    && value[1] >= -180
    && value[1] <= 180;
}

export function normalizeStoredManualObserver(value: unknown): StoredManualObserver | null {
  if (isCoordinatePair(value)) return { position: value, reference: "manual" };
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (!isCoordinatePair(candidate.position)) return null;
  if (candidate.reference !== "home" && candidate.reference !== "manual") return null;
  return { position: candidate.position, reference: candidate.reference };
}

export function normalizeStringArray(value: unknown): string[] {
  let candidate: unknown[] = [];
  if (Array.isArray(value)) candidate = value;
  else if (value && typeof value === "object") {
    const nested = ["favorites", "favourites", "items", "ids"]
      .map((key) => (value as Record<string, unknown>)[key])
      .find((item): item is unknown[] => Array.isArray(item));
    candidate = nested ?? [];
  }
  return [...new Set(candidate.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))];
}

export function getBrowserStorage(kind: "local" | "session"): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function safeGetItem(storage: StorageLike | null, key: string): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSetItem(storage: StorageLike | null, key: string, value: string): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeRemoveItem(storage: StorageLike | null, key: string): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function safeReadJson<T>(storage: StorageLike | null, key: string, validate: (value: unknown) => value is T, fallback: T): T {
  const value = parseStoredJson(safeGetItem(storage, key));
  return validate(value) ? value : fallback;
}

export function safeWriteJson(storage: StorageLike | null, key: string, value: unknown): boolean {
  try {
    return safeSetItem(storage, key, JSON.stringify(value));
  } catch {
    return false;
  }
}

function migrateFavorites(storage: StorageLike) {
  const raw = safeGetItem(storage, XAVPAC_STORAGE_KEYS.favorites);
  if (raw === null) return;
  const parsed = parseStoredJson(raw);
  const favorites = normalizeStringArray(parsed);
  if (favorites.length || Array.isArray(parsed)) safeWriteJson(storage, XAVPAC_STORAGE_KEYS.favorites, favorites);
  else safeRemoveItem(storage, XAVPAC_STORAGE_KEYS.favorites);
}

function validateStoredHome(storage: StorageLike) {
  const raw = safeGetItem(storage, XAVPAC_STORAGE_KEYS.savedHome);
  if (raw === null) return;
  const home = parseStoredJson(raw);
  if (isCoordinatePair(home)) safeWriteJson(storage, XAVPAC_STORAGE_KEYS.savedHome, home);
  else safeRemoveItem(storage, XAVPAC_STORAGE_KEYS.savedHome);
}

function validateMapStyle(storage: StorageLike) {
  const value = safeGetItem(storage, XAVPAC_STORAGE_KEYS.mapStyle);
  if (value !== null && !["street", "satellite", "dark", "layers"].includes(value)) {
    safeRemoveItem(storage, XAVPAC_STORAGE_KEYS.mapStyle);
  }
}

export function migrateXavPacStorage(localStorage: StorageLike | null, sessionStorage: StorageLike | null = null) {
  if (!localStorage) return { migrated: false, version: null } as const;
  const storedVersion = Number.parseInt(safeGetItem(localStorage, XAVPAC_STORAGE_VERSION_KEY) ?? "0", 10);
  if (storedVersion === XAVPAC_STORAGE_VERSION) return { migrated: false, version: storedVersion } as const;
  if (storedVersion > XAVPAC_STORAGE_VERSION) return { migrated: false, version: storedVersion } as const;

  migrateFavorites(localStorage);
  validateStoredHome(localStorage);
  validateMapStyle(localStorage);
  safeRemoveItem(sessionStorage, XAVPAC_STORAGE_KEYS.manualObserver);
  safeSetItem(localStorage, XAVPAC_STORAGE_VERSION_KEY, String(XAVPAC_STORAGE_VERSION));
  return { migrated: true, version: XAVPAC_STORAGE_VERSION } as const;
}

export function initializeBrowserStorage() {
  return migrateXavPacStorage(getBrowserStorage("local"), getBrowserStorage("session"));
}

export function resetModulePreferences(module: string) {
  const local = getBrowserStorage("local");
  const session = getBrowserStorage("session");
  if (module === "aviation" || module === "spotting" || module === "operations") {
    safeRemoveItem(local, XAVPAC_STORAGE_KEYS.favorites);
    safeRemoveItem(local, XAVPAC_STORAGE_KEYS.mapStyle);
    safeRemoveItem(local, XAVPAC_STORAGE_KEYS.soundPreference);
    safeRemoveItem(session, XAVPAC_STORAGE_KEYS.manualObserver);
  }
  if (module === "drone") safeRemoveItem(session, XAVPAC_STORAGE_KEYS.droneMission);
}
