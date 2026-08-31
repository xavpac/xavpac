import assert from "node:assert/strict";
import test from "node:test";
import { distanceBetweenKm, firmsBoundingBox, parseFirmsCsv } from "../../app/lib/fire/firms.ts";

test("parse les détections NASA FIRMS et conserve la fraîcheur UTC", () => {
  const csv = [
    "latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight",
    "43.7000,3.8000,329.4,0.5,0.6,2026-08-31,0042,N20,VIIRS,h,2.0NRT,294.2,18.7,N",
    "43.7100,3.8100,320.1,0.5,0.6,2026-08-31,1315,N20,VIIRS,n,2.0NRT,292.4,,D"
  ].join("\n");
  const detections = parseFirmsCsv(csv, "VIIRS_NOAA20_NRT");
  assert.equal(detections.length, 2);
  assert.equal(detections[0].acquiredAt, "2026-08-31T13:15:00.000Z");
  assert.equal(detections[1].frpMw, 18.7);
  assert.equal(detections[1].dayNight, "night");
});

test("ignore les lignes FIRMS invalides", () => {
  const csv = "latitude,longitude,acq_date,acq_time,satellite,instrument\n999,3.8,2026-08-31,1200,N20,VIIRS";
  assert.deepEqual(parseFirmsCsv(csv, "VIIRS_NOAA20_NRT"), []);
});

test("construit un périmètre et calcule les distances", () => {
  const box = firmsBoundingBox(43.6, 3.9, 50);
  assert.ok(box.west < 3.9 && box.east > 3.9 && box.south < 43.6 && box.north > 43.6);
  assert.ok(distanceBetweenKm([43.6, 3.9], [43.7, 3.9]) > 10);
});
