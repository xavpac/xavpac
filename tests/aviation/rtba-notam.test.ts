import test from "node:test";
import assert from "node:assert/strict";
import { assessRtba, pointInPolygon, RTBA_ZONES } from "../../app/lib/aviation/rtba.ts";
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
  assert.match(reading.schedule ?? "", /chaque jour/i);
  assert.match(reading.frenchText ?? "", /aéronefs sans équipage/i);
  assert.equal(reading.lowerLimit, "surface");
  assert.match(reading.upperLimit ?? "", /niveau moyen de la mer/i);
});
