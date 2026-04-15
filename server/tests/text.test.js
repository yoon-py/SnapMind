const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeSourceMaterialText, normalizeShortTitle, trimText } = require("../lib/text");

test("normalizeSourceMaterialText collapses noisy whitespace", () => {
  const value = "  alpha\r\n\r\nbeta   \n   gamma\n\n\n";

  assert.equal(normalizeSourceMaterialText(value), "alpha\n\nbeta\ngamma");
});

test("normalizeShortTitle removes bracket noise and trims words", () => {
  const value = "Vector spaces (draft edition)";

  assert.equal(normalizeShortTitle(value, "fallback", 40, 2), "Vector spaces");
});

test("trimText falls back when value is empty", () => {
  assert.equal(trimText("   ", "fallback"), "fallback");
});
