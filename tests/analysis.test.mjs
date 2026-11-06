import test from "node:test";
import assert from "node:assert/strict";
import "../frontend/mockups/kopperoinenp/data.js";
import "../frontend/mockups/kopperoinenp/model.js";
import "../frontend/mockups/kopperoinenp/story-model.js";
import "../frontend/mockups/kopperoinenp/analysis-model.js";

const data = globalThis.REVIEW_DATA;
const model = globalThis.WorkspaceModel;
const base = {
  customer: "CUST001",
  site: "all",
  country: "all",
  continent: "all",
  from: "2025-01",
  to: "2025-12",
  baseline: "B_LOCAL",
  priority: "water",
};
const close = (a, b) => assert.ok(Math.abs(a - b) < 0.001);

test("full scope matches the established annual reference", () => {
  const current = model.buildContext(data, base).metrics;
  const reference = globalThis.ReviewModel.aggregate(data, "CUST001");
  for (const key of [
    "water",
    "emissions",
    "repairs",
    "kg",
    "allocated",
    "scanned",
    "utilization",
    "sites",
  ])
    close(current[key], reference[key]);
});
test("period and country filters reconcile independently to original fixture rows", () => {
  const ctx = model.buildContext(data, {
    ...base,
    from: "2025-01",
    to: "2025-03",
    country: "Finland",
  });
  const ids = new Set(
    data.sites
      .filter((site) => site.customer_id === "CUST001" && site.country === "Finland")
      .map((site) => site.site_id),
  );
  const original = data.records.filter(
    (row) => row.customer === "CUST001" && ids.has(row.site) && row.month <= "2025-03",
  );
  close(
    ctx.metrics.water,
    original.reduce((sum, row) => sum + row.allocated_water_l, 0),
  );
  close(
    ctx.metrics.allocated,
    original
      .filter((row) => row.month === "2025-03")
      .reduce((sum, row) => sum + row.allocated_pieces, 0),
  );
  assert.equal(ctx.metrics.snapshotMonth, "2025-03");
  assert.ok(ctx.sites.every((site) => site.country === "Finland"));
});
test("monthly and country chart totals reconcile to the selected metrics", () => {
  const ctx = model.buildContext(data, { ...base, from: "2025-04", to: "2025-09" });
  for (const [metric, total] of [
    ["water", ctx.metrics.water],
    ["emissions", ctx.metrics.emissions],
    ["repairs", ctx.metrics.repairs],
  ]) {
    close(
      model.series(ctx, metric).reduce((sum, point) => sum + point.value, 0),
      total,
    );
    close(
      model.countries(data, ctx, metric).reduce((sum, point) => sum + point.value, 0),
      total,
    );
    assert.equal(model.series(ctx, metric).length, 6);
  }
});
test("empty geography and reversed periods remain explicit missing-data cases", () => {
  const empty = model.buildContext(data, { ...base, country: "Sweden", site: "S002" });
  assert.equal(empty.metrics.hasData, false);
  assert.equal(empty.focus, null);
  assert.equal(empty.metrics.utilization, null);
  const invalid = model.buildContext(data, { ...base, from: "2025-11", to: "2025-02" });
  assert.equal(invalid.invalidPeriod, true);
  assert.equal(invalid.metrics.hasData, false);
  assert.equal(model.select(data, { ...base, continent: "Asia" }).length, 0);
});
