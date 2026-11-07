import test from "node:test";
import assert from "node:assert/strict";
import { fixtureDataset } from "../backend/dataset.mjs";
import { subsetDataset } from "../backend/request-context.mjs";
import {
  checksum,
  importControls,
  validateImport,
  importCalculationVersion,
} from "../backend/fixture-import.mjs";

test("fixture connector preserves source control totals and current model metrics for all customers", () => {
  for (const customer of fixtureDataset.customers) {
    const payload = subsetDataset(fixtureDataset, [customer.customer_id]);
    const report = validateImport({
      payload,
      checksum: checksum(payload),
      customer_id: customer.customer_id,
      expected_controls: importControls(payload),
      calculation_version: importCalculationVersion,
      source_id: "project-fixture",
    });
    assert.equal(
      report.metrics.repairs,
      payload.records
        .filter((row) => row.month.startsWith(payload.year + "-"))
        .reduce((sum, row) => sum + row.repair_count, 0),
    );
    assert.equal(report.metrics.washed, report.controls.washedPieces);
    assert.equal(report.metrics.kg, report.controls.washedKg);
    assert.ok(report.metrics.allocated > 0);
    assert.equal(
      checksum(payload),
      checksum(Object.fromEntries(Object.entries(payload).reverse())),
    );
  }
});
