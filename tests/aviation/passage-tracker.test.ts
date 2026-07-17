import test from "node:test";
import assert from "node:assert/strict";
import {
  AIRCRAFT_POSITION_STALE_AFTER_SECONDS,
  PassageHistoryStore,
  analyzeAircraftPassage,
  droneOperationalPriority,
  type PassageAircraft,
  type PassageAnalysis
} from "../../app/lib/aviation/passageTracker.ts";

const observer: [number, number] = [46, 4];
const nowMs = Date.parse("2026-07-17T12:00:00.000Z");

function record(
  store: PassageHistoryStore,
  modeS: string,
  longitude: number,
  secondsBeforeNow: number,
  options: { latitude?: number; track?: number | null; speed?: number | null } = {}
) {
  store.record({
    modeS,
    latitude: options.latitude ?? 46,
    longitude,
    altitudeMeters: 1000,
    groundSpeedMetersPerSecond: options.speed === undefined ? 180 : options.speed,
    trackDegrees: options.track === undefined ? 90 : options.track,
    positionTimestampMs: nowMs - secondsBeforeNow * 1000,
    observer,
    observerTimestampMs: nowMs - secondsBeforeNow * 1000
  });
}

function aircraft(
  modeS: string,
  longitude: number,
  options: { latitude?: number; track?: number | null; speed?: number | null; ageSeconds?: number } = {}
): PassageAircraft {
  return {
    modeS,
    latitude: options.latitude ?? 46,
    longitude,
    altitudeMeters: 1000,
    groundSpeedMetersPerSecond: options.speed === undefined ? 180 : options.speed,
    trackDegrees: options.track === undefined ? 90 : options.track,
    positionTimestampMs: nowMs - (options.ageSeconds ?? 0) * 1000
  };
}

function analyze(store: PassageHistoryStore, current: PassageAircraft, gpsAccuracyMeters = 8, exactObserver: [number, number] = observer) {
  return analyzeAircraftPassage({
    aircraft: current,
    history: store.get(current.modeS),
    observer: exactObserver,
    gpsAccuracyMeters,
    nowMs
  });
}

function approachingHistory(modeS = "ABC001", options: { track?: number | null; speed?: number | null } = {}) {
  const store = new PassageHistoryStore();
  record(store, modeS, 3.80, 20, options);
  record(store, modeS, 3.83, 10, options);
  record(store, modeS, 3.86, 0, options);
  return store;
}

test("détecte un avion en rapprochement direct et estime prudemment son passage", () => {
  const store = approachingHistory();
  const result = analyze(store, aircraft("ABC001", 3.86));
  assert.equal(result.status, "approaching");
  assert.ok((result.closingSpeedMetersPerSecond ?? 0) > 0);
  assert.ok((result.estimatedSecondsToClosest ?? 0) > 20);
  assert.ok((result.estimatedMinimumDistanceKm ?? 1) < 0.2);
});

test("reconnaît un passage latéral au point le plus proche et son côté", () => {
  const store = new PassageHistoryStore();
  record(store, "LAT001", 3.94, 20, { latitude: 46.03, speed: 200 });
  record(store, "LAT001", 3.97, 10, { latitude: 46.03, speed: 200 });
  record(store, "LAT001", 4, 0, { latitude: 46.03, speed: 200 });
  const result = analyze(store, aircraft("LAT001", 4, { latitude: 46.03, speed: 200 }));
  assert.equal(result.status, "closest");
  assert.equal(result.passageSide, "nord");
  assert.ok((result.observedMinimumDistanceKm ?? 0) > 3);
});

test("détecte l’éloignement après le minimum réellement observé", () => {
  const store = new PassageHistoryStore();
  record(store, "REC001", 3.98, 20, { latitude: 46.01, speed: 190 });
  record(store, "REC001", 4.01, 10, { latitude: 46.01, speed: 190 });
  record(store, "REC001", 4.04, 0, { latitude: 46.01, speed: 190 });
  const result = analyze(store, aircraft("REC001", 4.04, { latitude: 46.01, speed: 190 }));
  assert.equal(result.status, "receding");
  assert.ok((result.secondsSinceClosest ?? 0) >= 10);
  assert.ok((result.closingSpeedMetersPerSecond ?? 0) < 0);
});

test("refuse toute estimation avec une position aéronef trop ancienne", () => {
  const store = approachingHistory("OLD001");
  const result = analyze(store, aircraft("OLD001", 3.86, { ageSeconds: AIRCRAFT_POSITION_STALE_AFTER_SECONDS + 1 }));
  assert.equal(result.status, "stale");
  assert.equal(result.estimatedSecondsToClosest, null);
  assert.equal(result.estimatedMinimumDistanceKm, null);
});

test("sans cap, utilise seulement la tendance historique sans inventer d’ETA", () => {
  const store = approachingHistory("NOTRK1", { track: null });
  const result = analyze(store, aircraft("NOTRK1", 3.86, { track: null }));
  assert.equal(result.status, "approaching");
  assert.equal(result.estimatedSecondsToClosest, null);
  assert.equal(result.estimatedMinimumDistanceKm, null);
  assert.equal(result.progressPercent, null);
});

test("sans vitesse, utilise seulement la tendance historique sans inventer de côté", () => {
  const store = approachingHistory("NOSPD1", { speed: null });
  const result = analyze(store, aircraft("NOSPD1", 3.86, { speed: null }));
  assert.equal(result.status, "approaching");
  assert.equal(result.estimatedSecondsToClosest, null);
  assert.equal(result.passageSide, null);
});

test("signale explicitement une mauvaise précision GPS", () => {
  const store = approachingHistory("GPS001");
  const result = analyze(store, aircraft("GPS001", 3.86), 125);
  assert.equal(result.gpsAccuracyLimited, true);
  assert.equal(result.gpsAccuracyMeters, 125);
});

test("isole simultanément les historiques de plusieurs Mode-S", () => {
  const store = new PassageHistoryStore();
  record(store, "AAA111", 3.8, 10);
  record(store, "BBB222", 4.2, 10, { track: 270 });
  record(store, "AAA111", 3.84, 0);
  record(store, "BBB222", 4.16, 0, { track: 270 });
  assert.equal(store.size(), 2);
  assert.equal(store.get("AAA111").length, 2);
  assert.equal(store.get("BBB222").length, 2);
  assert.notDeepEqual(store.get("AAA111"), store.get("BBB222"));
});

test("supprime globalement les historiques Mode-S sortis de la fenêtre de huit minutes", () => {
  const store = new PassageHistoryStore();
  record(store, "EXPIRED", 3.8, 9 * 60);
  record(store, "CURRENT", 3.9, 0);
  assert.equal(store.get("EXPIRED").length, 0);
  assert.equal(store.size(), 1);
});

test("un changement rapide de sélection ne réutilise jamais l’historique d’un autre avion", () => {
  const store = new PassageHistoryStore();
  record(store, "SELECTA", 3.8, 10);
  record(store, "SELECTA", 3.84, 0);
  record(store, "SELECTB", 4.02, 10);
  record(store, "SELECTB", 4.08, 0);
  const first = analyze(store, aircraft("SELECTA", 3.84));
  const second = analyze(store, aircraft("SELECTB", 4.08));
  assert.equal(first.status, "approaching");
  assert.equal(second.status, "receding");
});

test("classe un hélicoptère en rapprochement selon la priorité Drone", () => {
  const store = approachingHistory("HELI01");
  const passage = analyze(store, aircraft("HELI01", 3.86));
  assert.equal(droneOperationalPriority({ analysis: passage, altitudeMeters: 2200, isHelicopter: true, isRemarkable: false }), 2);
  assert.equal(droneOperationalPriority({ analysis: passage, altitudeMeters: 700, isHelicopter: true, isRemarkable: false }), 1);
});

test("recalcule la distance depuis les coordonnées GPS exactes fournies", () => {
  const store = approachingHistory("EXACT1");
  const current = aircraft("EXACT1", 3.86);
  const fromExactGps = analyze(store, current, 8, [46, 3.95]);
  const fromApproximatePlace = analyze(store, current, 8, [46, 4.25]);
  assert.ok((fromExactGps.currentDistanceKm ?? Infinity) < (fromApproximatePlace.currentDistanceKm ?? 0));
});

test("une position unique reste en attente même avec cap et vitesse", () => {
  const store = new PassageHistoryStore();
  record(store, "SINGLE", 3.86, 0);
  const result = analyze(store, aircraft("SINGLE", 3.86));
  assert.equal(result.status, "waiting");
  assert.equal(result.estimatedSecondsToClosest, null);
});

test("la fonction de priorité accepte un résultat sans alerte", () => {
  const neutral: PassageAnalysis = {
    status: "non-convergent",
    currentDistanceKm: 12,
    distanceDeltaKm: 0,
    closingSpeedMetersPerSecond: 0,
    estimatedSecondsToClosest: null,
    estimatedMinimumDistanceKm: 9,
    observedMinimumDistanceKm: 12,
    secondsSinceClosest: null,
    passageSide: null,
    freshnessSeconds: 2,
    progressPercent: null,
    gpsAccuracyLimited: false,
    gpsAccuracyMeters: 5,
    historyPointCount: 3
  };
  assert.equal(droneOperationalPriority({ analysis: neutral, altitudeMeters: 500, isHelicopter: false, isRemarkable: false }), 6);
});
