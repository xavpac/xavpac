import assert from "node:assert/strict";
import test from "node:test";
import { normalizeStoredDroneMission, resolveMissionWindow, zonedDateTimeToUtcMs } from "../../app/lib/drone/mission.ts";
import { assessNotamForMission } from "../../app/lib/drone/notamMission.ts";
import { evaluateRtbaMission, type RtbaActivationFeed } from "../../app/lib/drone/rtbaSchedule.ts";
import { assessRtba } from "../../app/lib/aviation/rtba.ts";

test("convertit une mission Europe/Paris en UTC en tenant compte de l’heure d’été", () => {
  assert.equal(new Date(zonedDateTimeToUtcMs("2026-08-09", "18:30") ?? 0).toISOString(), "2026-08-09T16:30:00.000Z");
  assert.equal(new Date(zonedDateTimeToUtcMs("2026-01-09", "18:30") ?? 0).toISOString(), "2026-01-09T17:30:00.000Z");
});

test("refuse une mission dont la fin précède le début", () => {
  assert.equal(resolveMissionWindow({ date: "2026-08-09", startTime: "18:30", endTime: "18:00", nowMode: false }), null);
  assert.equal(resolveMissionWindow({ date: "2026-08-09", startTime: "18:00", endTime: "18:45", nowMode: false })?.durationMinutes, 45);
});

test("restaure uniquement une mission Drone de session valide", () => {
  assert.deepEqual(normalizeStoredDroneMission({
    reference: "manual", point: [46.306, 4.831], heightMeters: 80, nowMode: false,
    date: "2026-08-09", startTime: "18:00", endTime: "18:45"
  })?.point, [46.306, 4.831]);
  assert.equal(normalizeStoredDroneMission({ reference: "manual", point: null, heightMeters: 80, nowMode: true, date: "2026-08-09", startTime: "18:00", endTime: "18:45" }), null);
});

test("classe un NOTAM sensible comme impact direct seulement sur les trois dimensions", () => {
  const result = assessNotamForMission({
    qCode: "QWULW", category: "Aéronefs sans pilote / drones", impactsPoint: true, distanceToAreaKm: 0, radiusNm: 5,
    lowerFl: 0, upperFl: 10, startsAtIso: "2026-08-09T16:00:00Z", endsAtIso: "2026-08-09T18:00:00Z", schedule: null
  }, Date.parse("2026-08-09T16:30:00Z"), Date.parse("2026-08-09T17:15:00Z"), 80);
  assert.equal(result.level, "direct");
  assert.equal(result.vertical, "intersects");
  assert.equal(result.temporal, "intersects");
});

test("reconnaît la validité d’un NOTAM permanent sans inventer de date de fin", () => {
  const result = assessNotamForMission({
    notamType: "NOTAMN", qCode: "QWULW", category: "Aéronefs sans pilote / drones", impactsPoint: true,
    distanceToAreaKm: 0, radiusNm: 2, lowerFl: 0, upperFl: 10, startsAtIso: "2026-08-01T00:00:00Z",
    endsAtIso: null, isPermanent: true, schedule: null
  }, Date.parse("2026-08-09T16:30:00Z"), Date.parse("2026-08-09T17:15:00Z"), 80);
  assert.equal(result.temporal, "intersects");
  assert.equal(result.level, "direct");
});

test("ne transforme pas un NOTAMC en blocage direct", () => {
  const result = assessNotamForMission({
    notamType: "NOTAMC", qCode: "QWULW", category: "Aéronefs sans pilote / drones", impactsPoint: true,
    distanceToAreaKm: 0, radiusNm: 2, lowerFl: 0, upperFl: 10, startsAtIso: "2026-08-09T16:00:00Z",
    endsAtIso: "2026-08-09T18:00:00Z", schedule: null
  }, Date.parse("2026-08-09T16:30:00Z"), Date.parse("2026-08-09T17:15:00Z"), 80);
  assert.equal(result.level, "relevant");
});

test("ne transforme jamais une source RTBA absente en statut inactif", () => {
  const assessment = assessRtba([47, 4.3], 80);
  const feed: RtbaActivationFeed = { state: "unavailable", source: "SIA/AZBA", publishedAt: null, retrievedAt: null, coverageStartsAt: null, coverageEndsAt: null, slots: null };
  assert.equal(evaluateRtbaMission(assessment, feed, Date.parse("2026-08-09T16:00:00Z"), Date.parse("2026-08-09T17:00:00Z")).code, "unconfirmed");
});

test("calcule exactement le chevauchement de plusieurs créneaux RTBA", () => {
  const assessment = assessRtba([47, 4.3], 80);
  const feed: RtbaActivationFeed = {
    state: "ready", source: "SIA/AZBA", publishedAt: "2026-08-09T15:50:00Z", retrievedAt: "2026-08-09T15:55:00Z",
    coverageStartsAt: "2026-08-09T00:00:00Z", coverageEndsAt: "2026-08-10T00:00:00Z",
    slots: [
      { zoneId: "LF R 45 B", startsAt: "2026-08-09T16:30:00Z", endsAt: "2026-08-09T16:45:00Z" },
      { zoneId: "LF R 45 B", startsAt: "2026-08-09T17:00:00Z", endsAt: "2026-08-09T17:30:00Z" }
    ]
  };
  const result = evaluateRtbaMission(assessment, feed, Date.parse("2026-08-09T16:00:00Z"), Date.parse("2026-08-09T17:15:00Z"), Date.parse("2026-08-09T16:00:00Z"));
  assert.equal(result.code, "mission-overlap");
  assert.equal(result.overlapMinutes, 30);
});

test("distingue un créneau actif maintenant d’une activation future", () => {
  const assessment = assessRtba([47, 4.3], 80);
  const feed: RtbaActivationFeed = {
    state: "ready", source: "SIA/AZBA", publishedAt: "2026-08-09T15:55:00Z", retrievedAt: "2026-08-09T15:59:00Z",
    coverageStartsAt: "2026-08-09T00:00:00Z", coverageEndsAt: "2026-08-10T00:00:00Z",
    slots: [{ zoneId: "LF R 45 B", startsAt: "2026-08-09T15:45:00Z", endsAt: "2026-08-09T16:15:00Z" }]
  };
  assert.equal(evaluateRtbaMission(assessment, feed, Date.parse("2026-08-09T15:55:00Z"), Date.parse("2026-08-09T16:10:00Z"), Date.parse("2026-08-09T16:00:00Z")).code, "active-now");
  const future = evaluateRtbaMission(assessment, feed, Date.parse("2026-08-09T18:00:00Z"), Date.parse("2026-08-09T18:30:00Z"), Date.parse("2026-08-09T16:00:00Z"));
  assert.equal(future.code, "no-slot");
  assert.equal(future.severity, "clear");
  assert.equal(future.current?.zoneId, "LF R 45 B");
});

test("annonce la prochaine activation officielle sans la déclarer déjà active", () => {
  const assessment = assessRtba([47, 4.3], 80);
  const feed: RtbaActivationFeed = {
    state: "ready", source: "SIA/AZBA", publishedAt: "2026-08-09T15:55:00Z", retrievedAt: "2026-08-09T15:59:00Z",
    coverageStartsAt: "2026-08-09T00:00:00Z", coverageEndsAt: "2026-08-10T00:00:00Z",
    slots: [{ zoneId: "LF R 45 B", startsAt: "2026-08-09T18:00:00Z", endsAt: "2026-08-09T18:30:00Z" }]
  };
  const result = evaluateRtbaMission(assessment, feed, Date.parse("2026-08-09T16:00:00Z"), Date.parse("2026-08-09T16:45:00Z"), Date.parse("2026-08-09T16:00:00Z"));
  assert.equal(result.code, "inactive-next");
  assert.equal(result.next?.startsAt, "2026-08-09T18:00:00Z");
});
