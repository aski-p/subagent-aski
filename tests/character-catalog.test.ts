import assert from "node:assert/strict";
import test from "node:test";

import { characterPresets } from "../app/character-data";

test("catalog exposes 100 unique, evenly grouped character presets", () => {
  assert.equal(characterPresets.length, 100);
  assert.equal(new Set(characterPresets.map((preset) => preset.id)).size, 100);
  assert.equal(new Set(characterPresets.map((preset) => preset.name)).size, 100);

  for (const category of ["human", "animal", "fantasy", "robot"] as const) {
    const entries = characterPresets.filter((preset) => preset.category === category);
    assert.equal(entries.length, 25);
    assert.deepEqual(entries.map((preset) => preset.variant), Array.from({ length: 25 }, (_, index) => index));
  }
});
