import test from "node:test";
import assert from "node:assert/strict";
import "../frontend/mockups/kopperoinenp/dataset.js";
import "../frontend/mockups/kopperoinenp/data.js";

const { inspect } = globalThis.ReviewDataset;
const original = globalThis.REVIEW_DATA;

test("validates the full dataset and earlier summary-only datasets", () => {
  const current = inspect(JSON.stringify(original));
  assert.equal(current.issue, null);
  assert.equal(current.data.records.length, 408);
  const summary = { ...original, products: undefined, detail: undefined, cycleGroups: undefined };
  const earlier = inspect(JSON.stringify(summary));
  assert.equal(earlier.issue, null);
  assert.equal(earlier.data.detail, undefined);
});

test("rejects unreadable sources and does not evaluate fixture text as code", () => {
  assert.match(inspect("").issue.message, /missing/);
  assert.match(inspect("globalThis.REVIEW_DATA = JSON.parse('{}');").issue.message, /JSON/);
});

test("rejects incomplete coverage, invalid quantities and inconsistent detail", () => {
  const [record, ...records] = original.records;
  const [detail, ...details] = original.detail;
  const [cycle, ...cycles] = original.cycleGroups;
  const cases = [
    [{ records }, /coverage/],
    [{ records: [record, record, ...records] }, /duplicate/],
    [{ records: [{ ...record, repair_count: null }, ...records] }, /numeric/],
    [
      { records: [{ ...record, active_assets_scanned: record.allocated_pieces + 1 }, ...records] },
      /exceed/,
    ],
    [
      { detail: [{ ...detail, allocated_water_l: detail.allocated_water_l + 100 }, ...details] },
      /site totals/,
    ],
    [{ cycleGroups: [{ ...cycle, late: cycle.hours.length + 1 }, ...cycles] }, /cycle/],
  ];
  for (const [changes, expected] of cases) {
    const result = inspect(JSON.stringify({ ...original, ...changes }));
    assert.equal(result.data, null);
    assert.match(result.issue.message, expected);
    assert.ok(result.issue.field);
  }
});
