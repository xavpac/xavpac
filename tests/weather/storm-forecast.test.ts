import assert from "node:assert/strict";
import test from "node:test";
import { summarizeStormForecast, type StormForecastPoint } from "../../app/lib/weather/stormForecast.ts";

test("résume la prévision convective sans transformer l’indice en probabilité", () => {
  const points: StormForecastPoint[] = [
    { atUtc: "2026-08-12T12:00:00Z", lightningPotentialJkg: 20, capeJkg: 400, precipitationMm: 0.4, windGustKmh: 24 },
    { atUtc: "2026-08-12T12:15:00Z", lightningPotentialJkg: 80, capeJkg: 650, precipitationMm: 1.2, windGustKmh: 37 },
    { atUtc: "2026-08-12T12:30:00Z", lightningPotentialJkg: 40, capeJkg: null, precipitationMm: 0.8, windGustKmh: 31 }
  ];
  assert.deepEqual(summarizeStormForecast(points), {
    pointCount: 3,
    maximumLightningPotentialJkg: 80,
    maximumLightningPotentialAtUtc: "2026-08-12T12:15:00Z",
    maximumCapeJkg: 650,
    maximumPrecipitationMm: 1.2,
    maximumWindGustKmh: 37
  });
});

test("conserve des valeurs indéterminées lorsque le fournisseur ne les renseigne pas", () => {
  const summary = summarizeStormForecast([
    { atUtc: "2026-08-12T12:00:00Z", lightningPotentialJkg: null, capeJkg: null, precipitationMm: null, windGustKmh: null }
  ]);
  assert.equal(summary.maximumLightningPotentialJkg, null);
  assert.equal(summary.maximumLightningPotentialAtUtc, null);
  assert.equal(summary.maximumCapeJkg, null);
  assert.equal(summary.maximumPrecipitationMm, null);
  assert.equal(summary.maximumWindGustKmh, null);
});
