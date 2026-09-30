import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SETTINGS, normalizeSettings, normalizeFolderSidebarWidth, folderSidebarMaximum } from "../src/shared/settings.ts";

test("old Settings retain the sidebar baseline and unrelated preferences", () => {
  const old = structuredClone(DEFAULT_SETTINGS);
  delete old.picker.folderSidebarWidth;
  old.history.retentionCount = 777;
  const normalized = normalizeSettings(old);
  assert.equal(normalized.picker.folderSidebarWidth, 214);
  assert.equal(normalized.history.retentionCount, 777);
  assert.equal(normalizeSettings().picker.folderSidebarWidth, 214);
});
test("sidebar normalization rejects nonnumeric values and bounds rounded preferences", () => {
  for (const value of [undefined, null, "400", NaN, Infinity, -Infinity, {}]) assert.equal(normalizeFolderSidebarWidth(value), 214);
  for (const [value, expected] of [[0, 140], [-10, 140], [140, 140], [180, 180], [399.7, 400], [700, 600]]) {
    assert.equal(normalizeFolderSidebarWidth(value), expected);
    assert.equal(normalizeSettings({ picker: { folderSidebarWidth: value } }).picker.folderSidebarWidth, expected);
  }
});
test("responsive maximum reserves feed space without mutating preference", () => {
  const preferred = 600;
  assert.equal(folderSidebarMaximum(580), 260);
  assert.equal(folderSidebarMaximum(1000), 600);
  assert.equal(Math.min(preferred, folderSidebarMaximum(580)), 260);
  assert.equal(preferred, 600);
});
