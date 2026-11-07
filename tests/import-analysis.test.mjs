import test from "node:test";
import assert from "node:assert/strict";
import { analyzeImport } from "../backend/import-analysis.mjs";

const table = [
  { Month: "2024-01", Urgent: 2, Total: 20, "Bad kg": "", Contact: "private@example.test" },
  { Month: "2024-02", Urgent: 4, Total: 40, "Bad kg": "x" },
  { Month: "2024-03", Urgent: 2, Total: 20, "Bad kg": 1 },
  { Month: "2025-01", Urgent: 4, Total: 20, "Bad kg": 2 },
  { Month: "2025-02", Urgent: 8, Total: 40, "Bad kg": 3 },
  { Month: "2025-03", Urgent: 4, Total: 20, "Bad kg": 4 },
];
const recipe = {
  table: "t1",
  name: "Urgent replenishment share",
  operation: "ratio",
  value: "c2",
  denominator: "c3",
  period: "c1",
  unit: "%",
};
const options = { customer: "demo", allowSchemaSharing: true };

test("the local profile reports minimum coverage without sending anything to a provider", async () => {
  const report = await analyzeImport(
    { Private: table },
    {
      customer: "demo",
      generate: () => assert.fail("The provider must not be called"),
    },
  );
  assert.equal(report.status, "profile_only");
  assert.deepEqual(report.quality[0].columns[0].range, { from: "2024-01", to: "2025-03" });
  assert.equal(report.quality[0].columns[3].kind, "mixed");
  assert.equal(report.quality[0].columns[3].missing, 1);
});

test("valid tools run independently from rejected tools and send only schema labels", async () => {
  const report = await analyzeImport(
    { Private: table },
    {
      ...options,
      generate: async ({ input }) => {
        assert.doesNotMatch(input, /Private|2024-01|private@example|Bad kg|Contact|demo/);
        return { tools: [recipe, { ...recipe, value: "c4" }] };
      },
    },
  );
  assert.equal(report.status, "validated");
  assert.equal(report.tools[0].result, 20);
  assert.equal(report.tools[0].comparison.before, 10);
  assert.equal(report.tools[0].comparison.change, 10);
  assert.equal(report.suggestions.length, 1);
  assert.equal(report.rejected[0].reason, "incomplete_or_invalid_column");
});

test("incomplete history, impossible ratios and duplicate records do not become recommendations", async () => {
  const incomplete = await analyzeImport(
    { Usage: table.slice(1) },
    {
      ...options,
      generate: async () => ({ tools: [recipe] }),
    },
  );
  assert.equal(incomplete.tools[0].result, 20);
  assert.equal(incomplete.tools[0].comparison, null);
  assert.deepEqual(incomplete.suggestions, []);
  const badRatio = await analyzeImport(
    { Usage: table.map((row) => ({ ...row, Total: 0 })) },
    {
      ...options,
      generate: async () => ({ tools: [recipe] }),
    },
  );
  assert.equal(badRatio.rejected[0].reason, "invalid_ratio_components");
  const duplicates = await analyzeImport(
    { Usage: [...table, table[0]] },
    {
      ...options,
      generate: () => assert.fail("Duplicate-only table is not eligible"),
    },
  );
  assert.equal(duplicates.status, "no_eligible_data");
});
