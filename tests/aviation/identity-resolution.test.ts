import test from "node:test";
import assert from "node:assert/strict";
import { cachedWithPolicy } from "../../app/lib/aviation/cache.ts";
import { resolveAircraftIdentity } from "../../app/lib/aviation/identityResolver.ts";

test("fusionne l’identité par champ sans écraser une donnée fiable par du vide ou une donnée moins sûre", () => {
  const identity = resolveAircraftIdentity([
    {
      source: "Flux direct",
      retrievedAt: "2026-07-30T10:00:00.000Z",
      confidence: "probable",
      method: "direct",
      priority: 40,
      values: { registration: "F-FAUX", aircraftModel: "", operator: "SAF Helicopteres", category: "helicopter" }
    },
    {
      source: "Mémoire vérifiée",
      retrievedAt: "2026-07-30T09:00:00.000Z",
      confidence: "confirmed",
      method: "historical",
      priority: 100,
      values: { registration: "F-HJTB", aircraftModel: "H125", icaoTypeCode: "AS50", operator: "SAF Hélicoptères", category: "helicopter" }
    },
    {
      source: "Source vide",
      retrievedAt: "2026-07-30T11:00:00.000Z",
      confidence: "confirmed",
      method: "community",
      priority: 110,
      values: { registration: "", aircraftModel: null, operator: undefined }
    }
  ]);

  assert.equal(identity.registration, "F-HJTB");
  assert.equal(identity.aircraftModel, "H125");
  assert.equal(identity.operator, "SAF Hélicoptères");
  assert.equal(identity.category, "helicopter");
  assert.equal(identity.status, "complete");
  assert.equal(identity.fields.registration?.source, "Mémoire vérifiée");
});

test("classe une identité limitée au Mode-S comme inconnue", () => {
  const identity = resolveAircraftIdentity([]);
  assert.equal(identity.status, "unknown");
  assert.deepEqual(identity.sources, []);
});

test("emploie un cache négatif court distinct du cache positif", async () => {
  let calls = 0;
  const key = `negative-cache-test-${Date.now()}`;
  const loader = async () => { calls += 1; return null as string | null; };
  const policy = { ttlMs: 60_000, negativeTtlMs: 5, isNegative: (value: string | null) => value === null };
  await cachedWithPolicy(key, policy, loader);
  await cachedWithPolicy(key, policy, loader);
  assert.equal(calls, 1);
  await new Promise((resolve) => setTimeout(resolve, 15));
  await cachedWithPolicy(key, policy, loader);
  assert.equal(calls, 2);
});
