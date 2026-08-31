import assert from "node:assert/strict";
import test from "node:test";
import { NAVIGATION, moduleBelongsToUniverse } from "../../app/config/navigation.ts";

test("chaque univers possède une route et un module d’accueil valide", () => {
  for (const [universe, navigation] of Object.entries(NAVIGATION)) {
    assert.equal(navigation.href, `/${universe}`);
    assert.ok(navigation.modules.some((module) => module.id === navigation.defaultModule));
  }
});

test("les deux univers exposent des navigations métier distinctes", () => {
  assert.equal(moduleBelongsToUniverse("spotter", "aviation"), true);
  assert.equal(moduleBelongsToUniverse("spotter", "drone"), false);
  assert.equal(moduleBelongsToUniverse("drone", "drone"), true);
  assert.equal(moduleBelongsToUniverse("drone", "risks"), true);
  assert.equal(moduleBelongsToUniverse("drone", "aviation"), false);
});

test("les identifiants de modules ne sont pas dupliqués dans un univers", () => {
  for (const navigation of Object.values(NAVIGATION)) {
    const ids = navigation.modules.map((module) => module.id);
    assert.equal(new Set(ids).size, ids.length);
  }
});
