import assert from "node:assert/strict";
import test from "node:test";
import { planespottersUserAgent } from "../../app/lib/aviation/providers/planespottersUserAgent.ts";

test("identifie XavPac auprès de PlaneSpotters avec une URL de contact", () => {
  assert.equal(
    planespottersUserAgent("6.4.1", "https://github.com/xavpac/xavpac"),
    "XavPac/6.4.1 (+https://github.com/xavpac/xavpac)"
  );
});

test("refuse une valeur de contact invalide", () => {
  assert.equal(
    planespottersUserAgent("version locale", "adresse-invalide"),
    "XavPac/version-locale (+https://github.com/xavpac/xavpac)"
  );
});
