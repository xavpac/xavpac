import test from "node:test";
import assert from "node:assert/strict";
import { assessRtba, pointInPolygon, rtbaMapDisplayStatus, RTBA_ZONES } from "../../app/lib/aviation/rtba.ts";
import { readNotamInFrench } from "../../app/lib/aviation/notam.ts";

test("détecte un point dans l’emprise et le volume basse altitude de LF R 45 B", () => {
  const result = assessRtba([47.0, 4.3], 60);
  assert.equal(result.level, "inside-volume");
  assert.ok(result.matches.some((zone) => zone.id === "LF R 45 B" && zone.affectsRequestedHeight));
});

test("distingue le contour horizontal du volume RTBA au-dessus de 800 ft", () => {
  const result = assessRtba([46.48, 5.1], 120);
  assert.equal(result.level, "below-floor");
  assert.ok(result.matches.some((zone) => zone.id === "LF R 45 S5" && !zone.affectsRequestedHeight));
});

test("ne conclut pas hors RTBA lorsque le point est hors de la couverture locale", () => {
  assert.equal(assessRtba([44.8378, -0.5792], 60).level, "coverage-unavailable");
});

test("considère un sommet publié comme appartenant au polygone", () => {
  const zone = RTBA_ZONES.find((item) => item.id === "LF R 45 S5");
  assert.ok(zone);
  assert.equal(pointInPolygon(zone.positions[0], zone.positions), true);
});

test("colore la carte RTBA selon la relation au point sans inventer l’activation AZBA", () => {
  const inside = assessRtba([47.0, 4.3], 60);
  assert.equal(rtbaMapDisplayStatus("LF R 45 B", inside), "intersects-height");
  const below = assessRtba([46.48, 5.1], 120);
  assert.equal(rtbaMapDisplayStatus("LF R 45 S5", below), "below-floor");
  const outside = assessRtba([46.3069, 4.8287], 60);
  assert.equal(rtbaMapDisplayStatus(outside.nearest[0].zone.id, outside), "nearby");
  assert.equal(rtbaMapDisplayStatus("zone inexistante", outside), "unknown");
});

test("présente en français les champs opérationnels d’un NOTAM ICAO", () => {
  const reading = readNotamInFrench(`A1234/26 NOTAMN
Q) LFBB/QWULW/IV/BO/W/000/015/4630N00430E005
A) LFBB
B) 2607270800
C) 2607271600
D) DLY 0800-1600
E) UNMANNED ACFT ACT
F) SFC
G) 1500FT AMSL`);
  assert.ok(reading);
  assert.equal(reading.identifier, "A1234/26");
  assert.equal(reading.location, "LFBB");
  assert.equal(reading.startsAt, "27/07/2026 à 08:00 UTC");
  assert.equal(reading.endsAt, "27/07/2026 à 16:00 UTC");
  assert.equal(reading.schedule, "Chaque jour de 08:00 à 16:00 UTC");
  assert.match(reading.frenchText ?? "", /activité de drones/i);
  assert.equal(reading.lowerLimit, "Surface \/ sol");
  assert.match(reading.upperLimit ?? "", /1[\u202f ]500 pieds \(au-dessus du niveau moyen de la mer\)/i);
});

test("traduit les abréviations opérationnelles courantes d’un NOTAM", () => {
  const reading = readNotamInFrench(`B2345/26 NOTAMN
A) LFXX
B) 2607270800
C) 2607271800
E) RWY 18/36 CLSD DUE TO WIP. CRANE PSN 1NM FM THR.
F) SFC
G) 500FT AGL`);
  assert.ok(reading);
  assert.match(reading.frenchText ?? "", /piste 18\/36 fermée en raison de travaux en cours/i);
  assert.match(reading.frenchText ?? "", /grue positionnée à 1 NM du seuil/i);
  assert.match(reading.upperLimit ?? "", /500 pieds \(au-dessus du sol\)/i);
});


test("rend les horaires et limites d’un NOTAM lisibles en français", () => {
  const reading = readNotamInFrench(`C3456/26 NOTAMN
A) LFXX
B) 2610030600
C) 2610031800
D) MON-FRI 0700-1700
E) TEMPO RESTRICTED AREA ACT DUE TO MIL EXER
F) SFC
G) FL095`);
  assert.ok(reading);
  assert.equal(reading.schedule, "Du lundi au vendredi, de 07:00 à 17:00 UTC");
  assert.match(reading.frenchText ?? "", /zone réglementée temporaire/i);
  assert.match(reading.frenchText ?? "", /exercice militaire/i);
  assert.equal(reading.lowerLimit, "Surface / sol");
  assert.equal(reading.upperLimit, "Niveau de vol FL095");
});
