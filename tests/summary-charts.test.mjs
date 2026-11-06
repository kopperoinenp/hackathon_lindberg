import test from "node:test";
import assert from "node:assert/strict";
import "../frontend/mockups/kopperoinenp/data.js";
import "../frontend/mockups/kopperoinenp/model.js";
import "../frontend/mockups/kopperoinenp/story-model.js";
import "../frontend/mockups/kopperoinenp/analysis-model.js";
import "../frontend/mockups/kopperoinenp/summary-charts.js";

const data = globalThis.REVIEW_DATA;
const workspace = globalThis.WorkspaceModel;
const charts = globalThis.SummaryCharts;
const base = {
  customer: "CUST001",
  site: "all",
  country: "all",
  from: "2025-01",
  to: "2025-12",
  baseline: "B_LOCAL",
};
const close = (a, b) => assert.ok(Math.abs(a - b) < 0.001);

test("summary trend actuals and baselines reconcile to the selected headline totals", () => {
  const ctx = workspace.buildContext(data, {
    ...base,
    country: "Sweden",
    from: "2025-04",
    to: "2025-09",
  });
  for (const [metric, actual, baseline] of [
    ["water", ctx.metrics.water, ctx.compare.baselineWater],
    ["emissions", ctx.metrics.emissions, ctx.compare.baselineEmissions],
  ]) {
    const points = charts.comparisonPoints(ctx, metric);
    assert.equal(points.length, 6);
    close(
      points.reduce((sum, point) => sum + point.actual, 0),
      actual,
    );
    close(
      points.reduce((sum, point) => sum + point.baseline, 0),
      baseline,
    );
  }
});
test("repair chart does not invent an alternative-model repair count", () => {
  const ctx = workspace.buildContext(data, base);
  const points = charts.comparisonPoints(ctx, "repairs");
  assert.ok(points.every((point) => point.baseline === null));
  close(
    points.reduce((sum, point) => sum + point.actual, 0),
    ctx.metrics.repairs,
  );
});
test("country share chart uses only the selected sites and normalizes actual totals", () => {
  const ctx = workspace.buildContext(data, base);
  const points = charts.countryShares(data, ctx, "water");
  close(
    points.reduce((sum, point) => sum + point.share, 0),
    1,
  );
  close(
    points.reduce((sum, point) => sum + point.value, 0),
    ctx.metrics.water,
  );
  const filtered = workspace.buildContext(data, { ...base, country: "Finland" });
  assert.deepEqual(
    charts.countryShares(data, filtered, "water").map((point) => [point.country, point.share]),
    [["Finland", 1]],
  );
});
test("single-month and empty selections produce valid, accessible chart output", () => {
  const ctx = workspace.buildContext(data, { ...base, from: "2025-02", to: "2025-02" });
  const svg = charts.lineChart(ctx, "water");
  assert.match(svg, /role="img"/);
  assert.match(svg, /2025-02/);
  assert.doesNotMatch(svg, /NaN|Infinity/);
  const empty = workspace.buildContext(data, { ...base, from: "2025-11", to: "2025-01" });
  assert.match(charts.lineChart(empty, "water"), /ei ole kaaviodataa/);
});
