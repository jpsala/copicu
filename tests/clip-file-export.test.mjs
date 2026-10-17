import assert from "node:assert/strict";
import { test } from "node:test";
import { exportSelectedFiles } from "../src/shared/clipFileExport.ts";
import { normalizeSettings } from "../src/shared/settings.ts";

const saved = (id) => ({ itemId: id, status: "saved", detail: "synthetic.txt" });

test("empty selection never writes or substitutes an active item", async () => {
  const result = await exportSelectedFiles([], () => { throw new Error("must not run"); }, () => false, () => {});
  assert.deepEqual(result, { results: [], cancelled: false });
});

test("selection and order are fixed before first item, including offscreen IDs", async () => {
  const selection = [402, 3, 9001];
  const calls = [];
  const progress = [];
  const result = await exportSelectedFiles(selection, async (id, ordinal) => {
    selection.splice(0); // Simulated picker selection changing while saving.
    calls.push([id, ordinal]);
    return saved(id);
  }, () => false, (items) => progress.push(items));
  assert.deepEqual(calls, [[402, 1], [3, 2], [9001, 3]]);
  assert.deepEqual(progress.map((items) => items.length), [1, 2, 3]);
  assert.equal(result.cancelled, false);
});

test("cancellation preserves completed items and stops before the next write", async () => {
  let stop = false;
  const calls = [];
  const result = await exportSelectedFiles([1, 2, 3], async (id) => {
    calls.push(id); stop = true; return saved(id);
  }, () => stop, () => {});
  assert.deepEqual(calls, [1]);
  assert.deepEqual(result.results, [saved(1)]);
  assert.equal(result.cancelled, true);
  const beforeStart = await exportSelectedFiles([1], () => { throw new Error("must not run"); }, () => true, () => {});
  assert.deepEqual(beforeStart, { results: [], cancelled: true });
});

test("individual failures and unsupported formats are explicit and do not abort others", async () => {
  const result = await exportSelectedFiles([1, 2, 3], async (id) => {
    if (id === 1) throw new Error("item deleted");
    if (id === 2) return { itemId: id, status: "skipped", detail: "Unsupported format" };
    return saved(id);
  }, () => false, () => {});
  assert.deepEqual(result.results.map((item) => item.status), ["failed", "skipped", "saved"]);
  assert.equal(result.cancelled, false);
});

test("older Settings have no default destination and normalize malformed preferences", () => {
  assert.equal(normalizeSettings().export.defaultFolder, "");
  assert.equal(normalizeSettings().export.openDestinationAfterSave, false);
  assert.equal(normalizeSettings().export.aiNames, false);
  assert.equal(normalizeSettings().export.namingModel, "");
  assert.equal(normalizeSettings({ export: { aiNames: true, namingModel: "synthetic-model" } }).export.namingModel, "synthetic-model");
  assert.equal(normalizeSettings({ export: { aiNames: "true", namingModel: 42 } }).export.aiNames, false);
  assert.equal(normalizeSettings({ export: { namingModel: 42 } }).export.namingModel, "");
  assert.equal(normalizeSettings({ export: { openDestinationAfterSave: true } }).export.openDestinationAfterSave, true);
  for (const value of [null, "true", 1, {}, undefined]) {
    assert.equal(normalizeSettings({ export: { openDestinationAfterSave: value } }).export.openDestinationAfterSave, false);
  }
  assert.equal(normalizeSettings({ export: { defaultFolder: "C:\\synthetic" } }).export.defaultFolder, "C:\\synthetic");
  for (const value of [null, 1, {}, undefined]) assert.equal(normalizeSettings({ export: { defaultFolder: value } }).export.defaultFolder, "");
});
