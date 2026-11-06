import test from "node:test";
import assert from "node:assert/strict";
import "../frontend/mockups/kopperoinenp-v1/data.js";
import "../frontend/mockups/kopperoinenp-v1/model.js";

const data = globalThis.REVIEW_DATA;
const { aggregate, comparison, rankedSites, escapeHtml } = globalThis.ReviewModel;
const local = data.baselines.find((row) => row.baseline_id === "B_LOCAL");
const close = (actual, expected, tolerance = 0.11) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`);

test("NorthStar annual results reconcile to the supplied Sample_Output reference", () => {
  const m = aggregate(data, "CUST001");
  assert.equal(m.sites, 24);
  assert.equal(m.allocated, 31743);
  assert.equal(m.repairs, 15233);
  close(m.kg, 502074.7);
  const c = comparison(m, local);
  // Recomputed from underlying rounded inputs; the sheet's pre-rounded savings
  // can differ by a few litres/kgCO2e over 864 product/month input rows.
  close(c.waterDifference, 1406482.6, 5);
  close(c.emissionsDifference, 255073.1, 5);
});

test("customer totals reconcile to all their sites for every additive metric", () => {
  for (const customer of data.customers) {
    const total = aggregate(data, customer.customer_id);
    const sites = rankedSites(data, customer.customer_id);
    for (const key of ["kg", "water", "emissions", "repairs", "allocated", "scanned"])
      close(
        sites.reduce((sum, site) => sum + site[key], 0),
        total[key],
      );
    assert.equal(total.monthly.length, 12);
    close(
      total.monthly.reduce((sum, value) => sum + value, 0),
      total.water,
    );
  }
});

test("stock quantities use December, not the sum of monthly snapshots", () => {
  const rows = {
    records: [
      {
        customer: "C",
        site: "S",
        month: "2025-01",
        allocated_pieces: 100,
        active_assets_scanned: 80,
        allocated_water_l: 20,
      },
      {
        customer: "C",
        site: "S",
        month: "2025-12",
        allocated_pieces: 50,
        active_assets_scanned: 40,
        allocated_water_l: 30,
      },
    ],
  };
  const m = aggregate(rows, "C");
  assert.equal(m.allocated, 50);
  assert.equal(m.scanned, 40);
  assert.equal(m.utilization, 80);
  assert.equal(m.water, 50);
});

test("baseline changes leave actuals unchanged and can produce a negative difference", () => {
  const m = aggregate(data, "CUST001");
  const home = comparison(
    m,
    data.baselines.find((r) => r.baseline_id === "B_HOME"),
  );
  assert.ok(home.waterDifference > comparison(m, local).waterDifference);
  assert.ok(comparison(m, { ...local, water_l_per_kg: 0 }).waterDifference < 0);
  assert.equal(comparison(m, { ...local, water_l_per_kg: 0 }).waterPercent, null);
  close(home.baselineWater - home.waterDifference, m.water);
});

test("empty selection does not turn missing utilization into a zero claim", () => {
  const m = aggregate(data, "CUST001", "NOT_A_SITE");
  assert.equal(m.utilization, null);
  assert.equal(m.allocated, 0);
  assert.equal(m.sites, 0);
});

test("notes are escaped before insertion into the review or chat", () => {
  assert.equal(
    escapeHtml('<img src=x onerror="alert(1)">'),
    "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
  );
  assert.equal(escapeHtml("A&B's"), "A&amp;B&#39;s");
});

test("fixture retains valid synthetic scope and unique monthly site keys", () => {
  assert.equal(data.status, "SYNTHETIC");
  assert.equal(data.customers.length, 3);
  assert.equal(data.sites.length, 34);
  assert.equal(data.records.length, 408);
  const keys = new Set();
  for (const row of data.records) {
    assert.match(row.month, /^2025-(0[1-9]|1[0-2])$/);
    assert.ok(data.sites.some((s) => s.site_id === row.site && s.customer_id === row.customer));
    const key = `${row.customer}/${row.site}/${row.month}`;
    assert.ok(!keys.has(key), `Duplicate ${key}`);
    keys.add(key);
    for (const [field, value] of Object.entries(row)) {
      if (!["customer", "site", "month"].includes(field))
        assert.ok(Number.isFinite(value) && value >= 0, `${key}/${field}`);
    }
  }
});
