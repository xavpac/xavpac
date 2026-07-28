import assert from "node:assert/strict";
import test from "node:test";
import { nationalAssetsInsideRadius } from "../../app/lib/aviation/nationalAlerts.ts";

test("conserve uniquement les moyens nationaux en vol dans le rayon de 100 km", () => {
  const nearby = nationalAssetsInsideRadius([
    { id: "dragon", callsign: "DRAGON", latitude: 46.5, longitude: 4.9, onGround: false, identification: { badge: "HÉLICOPTÈRE DRAGON", confidence: "confirmed" } },
    { id: "ground", callsign: "MILAN", latitude: 46.4, longitude: 4.9, onGround: true, identification: { badge: "DASH 8 Q400-MR", confidence: "confirmed" } },
    { id: "far", callsign: "SAMU", latitude: 48.8, longitude: 2.3, onGround: false, identification: { badge: "HÉLICOPTÈRE SAMU", confidence: "confirmed" } }
  ], [46.3, 4.8]);

  assert.deepEqual(nearby.map((asset) => asset.id), ["dragon"]);
  assert.equal(nearby[0].badge, "HÉLICOPTÈRE DRAGON");
});
