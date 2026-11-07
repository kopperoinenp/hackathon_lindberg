import test from "node:test";
import assert from "node:assert/strict";
import "../frontend/mockups/kopperoinenp/data.js";
import "../frontend/mockups/kopperoinenp/model.js";
import "../frontend/mockups/kopperoinenp/story-model.js";
import "../frontend/mockups/kopperoinenp/analysis-model.js";
import "../frontend/mockups/kopperoinenp/analysis-tools.js";

const data = globalThis.REVIEW_DATA;
const tools = globalThis.ReviewAnalysisTools;
const scope = {
  customer: "CUST001",
  from: "2025-01",
  to: "2025-12",
  site: "all",
  country: "all",
  continent: "all",
  baseline: "B_LOCAL",
  priority: "neutral",
};
const near = (actual, expected, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) < tolerance, actual);

test("all tools run and annual totals reconcile to independent workbook sample controls", () => {
  const results = Object.fromEntries(
    tools
      .run(
        data,
        scope,
        tools.catalog.map(({ id }) => id),
      )
      .map((entry) => [entry.id, entry]),
  );
  assert.equal(Object.keys(results).length, tools.catalog.length);
  assert.equal(results.adoption.values.allocatedPieces, 31743);
  near(results.operations.values.washedKg, 502074.7);
  assert.equal(results.operations.values.repairEvents, 15233);
  assert.equal(results.service.values.requests, 515);
  near(results.footprint.values.allocatedWasteKg, 16797.11);
  near(
    results.footprint.values.processKgCo2e + results.footprint.values.deliveryKgCo2e,
    results.footprint.values.emissionsKgCo2e,
  );
  near(
    results.baselines.values.scenarios.find(({ id }) => id === "B_LOCAL").waterDifferenceLitres,
    1406482.6,
    0.2,
  );
  near(
    results.laundry.values.byWashedKg.reduce((sum, row) => sum + row.washedKg, 0),
    502074.7,
  );
  assert.equal(results.period.values, null);
  assert.equal(results.peer.scope, null);
  near(results.peer.values.peerAverage, 0.3225);
});

test("period comparison keeps filters, uses equal-length periods and does not calculate missing detail", () => {
  const secondQuarter = { ...scope, country: "Finland", from: "2025-04", to: "2025-06" };
  const [result] = tools.run(data, secondQuarter, ["period"]);
  assert.deepEqual(result.values.previousPeriod, { from: "2025-01", to: "2025-03" });
  assert.equal(result.values.previousSnapshotMonth, "2025-03");
  assert.equal(result.values.currentSnapshotMonth, "2025-06");
  const finland = new Set(
    data.sites.filter((row) => row.country === "Finland").map((row) => row.site_id),
  );
  const q1Washed = data.records
    .filter(
      (row) => row.customer === scope.customer && finland.has(row.site) && row.month <= "2025-03",
    )
    .reduce((sum, row) => sum + row.customer_washed_kg, 0);
  near(result.values.before.washedKg, q1Washed);
  const summaryOnly = { ...data, detail: undefined, cycleGroups: undefined };
  const [footprint, laundry, service] = tools.run(summaryOnly, secondQuarter, [
    "footprint",
    "laundry",
    "service",
  ]);
  assert.equal(footprint.values.energyKwh, null);
  assert.equal(laundry.status, "unavailable");
  assert.equal(service.values.latePct, null);
  assert.equal(service.values.requests, null);
});
