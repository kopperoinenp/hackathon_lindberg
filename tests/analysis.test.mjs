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
    (row) =>
      row.customer === "CUST001" &&
      ids.has(row.site) &&
      row.month >= "2025-01" &&
      row.month <= "2025-03",
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

test("detailed models reconcile to the Finland Q1 workbook rows", () => {
  const selection = { ...base, country: "Finland", to: "2025-03" };
  const result = model.analyzeDetails(data, selection);
  const scoped = model.buildContext(data, selection).metrics;
  assert.equal(result.snapshotMonth, "2025-03");
  assert.equal(result.service.count, 2264);
  assert.equal(result.service.medianHours, 83);
  assert.equal(result.service.p90Hours, 108);
  close(result.service.latePct, (35 * 100) / 2264);
  assert.equal(result.service.requests, 55);
  close(result.energy, 53114.7);
  close(result.waste, 1945.23);
  close(result.energyPerKg, result.energy / scoped.kg);
  close(result.baselineEnergy, scoped.kg * 1.05);
  close(
    result.wasteRoutes.reduce((sum, route) => sum + route.kg, 0),
    result.waste,
  );
  close(
    result.wasteRoutes.reduce((sum, route) => sum + route.share, 0),
    1,
  );
  assert.equal(
    result.products.reduce((sum, product) => sum + product.allocated, 0),
    scoped.allocated,
  );
  assert.equal(
    result.products.reduce((sum, product) => sum + product.washed, 0),
    scoped.washed,
  );
  assert.equal(
    result.products.reduce((sum, product) => sum + product.repairs, 0),
    scoped.repairs,
  );
  assert.equal(
    result.serviceBySite.reduce((sum, site) => sum + site.count, 0),
    result.service.count,
  );
  close(result.repairScenarios[1].replacements, scoped.repairs * 0.5);
  close(result.repairScenarios[1].emissions, result.repairScenarios[2].emissions * 0.5);
});

test("unavailable detail and zero denominators remain distinct from measured zero", () => {
  const empty = model.analyzeDetails(data, { ...base, from: "2025-10", to: "2025-01" });
  assert.equal(empty.energy, null);
  assert.equal(empty.wasteRoutes[0].kg, null);
  assert.equal(empty.service.medianHours, null);
  assert.equal(empty.service.latePct, null);
  const first = data.detail.find((row) => row.customer === base.customer);
  const zero = model.analyzeDetails(
    {
      ...data,
      detail: [{ ...first, allocated_pieces: 0, customer_washed_kg: 0, allocated_energy_kwh: 0 }],
      cycleGroups: [],
    },
    base,
  );
  assert.equal(zero.energy, 0);
  assert.equal(zero.energyPerKg, null);
  assert.equal(zero.products[0].washesPerPieceMonth, null);
});

test("service cycle finding requires recurring gaps and comparable site coverage", () => {
  const scope = { ...base, from: "2025-01", to: "2025-02" };
  const [slow, peer, incomplete] = data.sites.filter((site) => site.customer_id === scope.customer);
  const group = (site, month, hours) => ({
    customer: scope.customer,
    site: site.site_id,
    month,
    hours: Array(15).fill(hours),
    late: 0,
  });
  const rows = [
    group(slow, scope.from, 30),
    group(slow, scope.to, 40),
    group(peer, scope.from, 20),
    group(peer, scope.to, 25),
    group(incomplete, scope.from, 100),
  ];
  const fixture = { ...data, cycleGroups: rows };
  const finding = model.serviceCycleFinding(fixture, scope);
  assert.equal(finding.site, slow.site_name);
  assert.equal(finding.gap, 15);
  assert.equal(finding.count, 30);
  assert.equal(finding.peerCount, 1);
  assert.equal(finding.monthsAbove, 2);
  assert.equal(model.serviceCycleFinding(fixture, { ...scope, site: slow.site_id }), null);
  rows[1] = group(slow, scope.to, 24);
  assert.equal(model.serviceCycleFinding(fixture, scope), null);
});
