import test from "node:test";
import assert from "node:assert/strict";
import { fixtureDataset } from "../backend/dataset.mjs";
import { subsetDataset } from "../backend/request-context.mjs";
import { calculateDashboard } from "../backend/dashboard-model.mjs";

test("prepared dashboard metrics preserve the original analyses across customer, period, site and baseline scopes", () => {
  for (const customer of fixtureDataset.customers) {
    const data = subsetDataset(fixtureDataset, [customer.customer_id]);
    for (const overrides of [
      {},
      { from: "2025-03", to: "2025-06" },
      { site: data.sites[0].site_id },
      { baseline: "B_HOME" },
    ]) {
      const scope = {
        customer: customer.customer_id,
        from: "2025-01",
        to: "2025-12",
        site: "all",
        country: "all",
        continent: "all",
        baseline: "B_LOCAL",
        ...overrides,
      };
      const result = calculateDashboard(data, scope);
      assert.deepEqual(
        result.contexts.neutral.metrics,
        globalThis.WorkspaceModel.buildContext(data, scope).metrics,
      );
      assert.deepEqual(result.detail, globalThis.WorkspaceModel.analyzeDetails(data, scope));
      assert.deepEqual(
        result.comparisons.yoy,
        globalThis.ReviewAnalysisTools.periodComparison(data, scope, "yoy"),
      );
      assert.deepEqual(result.proposals.fi, globalThis.UpsellModel.proposals(data, scope, "fi"));
      assert.equal(result.contexts.neutral.rows, undefined);
      const inspect = (value) => {
        if (!value || typeof value !== "object") return;
        for (const [key, item] of Object.entries(value)) {
          assert.ok(
            !["hours", "washed_pieces", "allocated_water_l", "cycleGroups"].includes(key),
            `Raw field leaked: ${key}`,
          );
          inspect(item);
        }
      };
      inspect(result);
      assert.ok(Buffer.byteLength(JSON.stringify(result)) < 200 * 1024);
    }
  }
});
