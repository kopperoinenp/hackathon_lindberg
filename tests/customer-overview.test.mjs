import test from "node:test";
import assert from "node:assert/strict";
import "../frontend/mockups/kopperoinenp/data.js";
import "../frontend/mockups/kopperoinenp/analysis-model.js";
const data = globalThis.REVIEW_DATA;
const { customerOverview } = globalThis.WorkspaceModel;
test("customer overview includes every customer location and only the latest stock snapshot", () => {
  for (const customer of data.customers) {
    const overview = customerOverview(data, customer.customer_id);
    const rows = data.records.filter(
      (r) => r.customer === customer.customer_id && r.month === overview.snapshotMonth,
    );
    assert.equal(overview.snapshotMonth, "2025-12");
    assert.equal(
      overview.allocated,
      rows.reduce((sum, r) => sum + r.allocated_pieces, 0),
    );
    assert.equal(
      overview.sites.length,
      data.sites.filter((s) => s.customer_id === customer.customer_id).length,
    );
    assert.equal(
      overview.allocated,
      overview.sites.reduce((sum, s) => sum + s.allocated, 0),
    );
    assert.equal(overview.complete, true);
  }
});
test("missing stock is explicit and is not replaced by an older month or zero", () => {
  const fixture = {
    customers: [{ customer_id: "A" }],
    sites: [
      { customer_id: "A", site_id: "1", country: "Finland", city: "Turku" },
      { customer_id: "A", site_id: "2", country: "Finland", city: "Helsinki" },
    ],
    records: [
      { customer: "A", site: "1", month: "2025-11", allocated_pieces: 900 },
      { customer: "A", site: "2", month: "2025-12", allocated_pieces: 20 },
    ],
  };
  const overview = customerOverview(fixture, "A");
  assert.equal(overview.allocated, 20);
  assert.equal(overview.complete, false);
  assert.equal(overview.sites.find((s) => s.site_id === "1").allocated, null);
  assert.equal(customerOverview({ ...fixture, records: [] }, "A").allocated, null);
});
