import assert from "node:assert/strict";
import test from "node:test";
import { appendObservedPosition, buildSelectedTrail } from "../../app/lib/aviation/selectedTrail.ts";

test("affiche immédiatement un guide de cap pointillé avec une seule position", () => {
  const trail = buildSelectedTrail({
    observedPositions: [[46.5, 4.8]],
    currentPosition: [46.5, 4.8],
    trackDegrees: 90,
    speedMetersPerSecond: 150
  });

  assert.equal(trail?.kind, "heading");
  assert.deepEqual(trail?.positions[1], [46.5, 4.8]);
  assert.ok((trail?.positions[0][1] ?? 5) < 4.8);
});

test("remplace le guide de cap par le tracé réellement observé dès le second point", () => {
  const positions = appendObservedPosition(
    appendObservedPosition([], [46.5, 4.8]),
    [46.51, 4.82]
  );
  const trail = buildSelectedTrail({
    observedPositions: positions,
    currentPosition: [46.51, 4.82],
    trackDegrees: 60,
    speedMetersPerSecond: 120
  });

  assert.equal(trail?.kind, "observed");
  assert.deepEqual(trail?.positions, [[46.5, 4.8], [46.51, 4.82]]);
});

test("ne fabrique aucune direction lorsque le cap est inconnu", () => {
  const trail = buildSelectedTrail({
    observedPositions: [[46.5, 4.8]],
    currentPosition: [46.5, 4.8],
    trackDegrees: null,
    speedMetersPerSecond: 120
  });
  assert.equal(trail, null);
});
