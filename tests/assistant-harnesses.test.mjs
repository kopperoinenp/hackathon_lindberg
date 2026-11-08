import test from "node:test";
import assert from "node:assert/strict";
import { runAnalysisHarness, runDashboardHarness } from "../backend/assistant-harnesses.mjs";
import { chatSchema, normalizeWorkspace } from "../backend/review-chat.mjs";
import { analysisRuntime } from "../backend/analysis-runtime.mjs";
import { requestContext, subsetDataset } from "../backend/request-context.mjs";
import { fixtureDataset } from "../backend/dataset.mjs";

const workspace = () => normalizeWorkspace({ scope: { customer: "CUST002" }, language: "en" });
function patch() {
  return {
    ...Object.fromEntries(chatSchema.required.map((key) => [key, null])),
    supported: true,
    scope: Object.fromEntries(chatSchema.properties.scope.required.map((key) => [key, null])),
    analysisRequest: null,
  };
}
const selection = (fields) => ({
  route: "query",
  query: null,
  tools: [],
  toolId: null,
  explanation: null,
  ...fields,
});

test("analyst calculates a scoped answer without mutating the workspace", async () => {
  const current = workspace();
  const before = structuredClone(current);
  const result = await runAnalysisHarness(
    { message: "Compare emissions by country", workspace: current },
    {
      generate: async ({ name, schema }) => {
        assert.equal(name, "analysis_tool_selection");
        assert.ok(!JSON.stringify(schema).includes("slideSwap"));
        return selection({ query: { topic: "emissions", compareBy: "country" } });
      },
    },
  );
  assert.deepEqual(result.workspace, before);
  assert.deepEqual(result.changed, []);
  assert.ok(result.view.rows.length);
  assert.equal(result.trace.at(-1).tool, "dataQuery");
});

test("a missing tool is profiled, validated, executed and reused only in its scope", async () => {
  const current = workspace();
  let generatedId;
  const generate = async ({ name, input }) => {
    if (name === "analysis_tool_selection")
      return selection(
        generatedId ? { route: "existing", toolId: generatedId } : { route: "create" },
      );
    if (name === "analysis_tool_definition") {
      const { tables } = JSON.parse(input);
      const table = tables.find(({ name }) => name === "activity");
      const value = table.columns.find(({ column }) => column === "repair_count");
      return {
        table: table.id,
        name: "Repairs",
        operation: "sum",
        value: value.id,
        denominator: null,
        period: null,
        unit: "repairs",
      };
    }
    return { reply: "The calculation is complete." };
  };
  const created = await runAnalysisHarness(
    { message: "Build the repair total", workspace: current },
    { generate },
  );
  generatedId = created.results[0].id;
  assert.ok(created.view.rows[0].value > 0);
  assert.deepEqual(
    created.trace.map(({ stage }) => stage),
    ["catalog", "inspect", "validate", "execute"],
  );
  const reused = await runAnalysisHarness(
    { message: "Run it again", workspace: current },
    { generate },
  );
  assert.equal(reused.trace[1].stage, "reuse");
  assert.equal(reused.view.rows[0].value, created.view.rows[0].value);
  const other = normalizeWorkspace({ scope: { customer: "CUST001" } });
  assert.throws(() => analysisRuntime(other).run(generatedId), /expired/);
});

test("invalid generated tools fail before execution", async () => {
  await assert.rejects(
    () =>
      runAnalysisHarness(
        { message: "Create a metric", workspace: workspace() },
        {
          generate: async ({ name }) =>
            name === "analysis_tool_selection"
              ? selection({ route: "create" })
              : {
                  table: "t1",
                  name: "Bad",
                  operation: "exec",
                  value: "c1",
                  denominator: null,
                  period: null,
                  unit: "EUR",
                },
        },
      ),
    /failed validation/,
  );
});

test("snapshot sums and invented units are refused by the runtime", () => {
  const runtime = analysisRuntime(workspace());
  const table = runtime.schema.find(({ name }) => name === "activity");
  const definition = {
    table: table.id,
    name: "Sum",
    operation: "sum",
    denominator: null,
    period: null,
    unit: "count",
  };
  const snapshot = table.columns.find(({ column }) => column === "allocated_pieces");
  const repairs = table.columns.find(({ column }) => column === "repair_count");
  assert.throws(() => runtime.create({ ...definition, value: snapshot.id }), /failed validation/);
  assert.throws(
    () => runtime.create({ ...definition, value: repairs.id, unit: "EUR" }),
    /failed validation/,
  );
});

test("editor orders added modules and never returns an analysis answer", async () => {
  const result = await runDashboardHarness(
    { message: "Add service performance", workspace: workspace() },
    {
      generate: async ({ schema }) => {
        assert.deepEqual(schema.properties.dataQuery, { type: "null" });
        return {
          ...patch(),
          evidenceAreas: ["improvement", "performance", "operations"],
          dashboardLayout: { sections: ["plan", "results", "overview"], metrics: ["water"] },
        };
      },
    },
  );
  assert.deepEqual(result.workspace.evidenceAreas, ["performance", "operations", "improvement"]);
  assert.deepEqual(result.workspace.dashboardLayout.sections, ["overview", "results", "plan"]);
  assert.equal(result.answer, undefined);
  assert.equal(result.view, undefined);
});

test("editor rejects an analysis response and coordinates missing evidence internally", async () => {
  await assert.rejects(
    () =>
      runDashboardHarness(
        { message: "Edit the dashboard", workspace: workspace() },
        {
          generate: async () => ({ ...patch(), dataQuery: { topic: "water" } }),
        },
      ),
    /invalid dashboard change/,
  );
  const calls = [];
  const result = await runDashboardHarness(
    { message: "Add a service block", workspace: workspace() },
    {
      generate: async ({ name }) => {
        calls.push(name);
        if (name === "dashboard_edit")
          return { ...patch(), analysisRequest: "Check service performance" };
        if (name === "analysis_tool_selection")
          return selection({ route: "tools", tools: ["service"] });
        if (name === "assistant_reply") return { reply: "Service evidence is available." };
        return { ...patch(), evidenceAreas: ["performance"] };
      },
    },
  );
  assert.deepEqual(calls, [
    "dashboard_edit",
    "analysis_tool_selection",
    "assistant_reply",
    "dashboard_edit_with_evidence",
  ]);
  assert.equal(result.trace[0].stage, "analyst");
  assert.equal(result.answer, undefined);
});

test("generated tools and raw profiles respect the shared user's customer boundary", async () => {
  await requestContext.run(
    {
      user: { id: "reader", tenant_id: "test" },
      permissions: new Map([["CUST002", false]]),
      data: subsetDataset(fixtureDataset, ["CUST002"]),
    },
    async () => {
      const current = workspace();
      const runtime = analysisRuntime(current);
      assert.ok(runtime.schema.every(({ rows }) => rows > 0));
      assert.throws(
        () => analysisRuntime({ scope: { ...current.scope, customer: "CUST001" } }),
        /No access/,
      );
      await assert.rejects(
        () =>
          runDashboardHarness(
            { message: "Add service performance", workspace: current },
            {
              generate: async () => ({ ...patch(), evidenceAreas: ["performance"] }),
            },
          ),
        /No access/,
      );
    },
  );
});
