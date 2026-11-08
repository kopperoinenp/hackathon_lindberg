// Explicit live-provider acceptance tests. No real customer data or chat history.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { runAnalysisHarness, runDashboardHarness } from "../backend/assistant-harnesses.mjs";
import { providerConfig } from "../backend/ai-provider.mjs";
import { normalizeWorkspace } from "../backend/review-chat.mjs";
import { rememberAnalysisImport } from "../backend/analysis-runtime.mjs";
import { analyzeImport } from "../backend/import-analysis.mjs";

if (!process.argv.includes("--live"))
  throw new Error("Use --live to run acceptance tests with the configured provider.");
if (existsSync(".env")) process.loadEnvFile(".env");
const config = providerConfig();
if (!config.configured || config.provider === "deterministic")
  throw new Error("Configure OpenAI or Copilot before running the live harness tests.");
const current = () =>
  normalizeWorkspace({
    scope: { customer: "CUST002" },
    included: ["water", "emissions", "repairs"],
    evidenceAreas: ["scorecard", "operations", "future"],
    language: "fi",
  });
const cases = [
  {
    agent: "analysis",
    message: "Paljonko vettä on kulunut yhteensä?",
    alternative: "How much water did we use in total?",
    check: (result) => {
      assert.equal(result.query.topic, "water");
      assert.equal(result.query.measure, "total");
      assert.ok(result.view.rows[0].value > 0);
    },
  },
  {
    agent: "analysis",
    message: "Mistä päästöt tulevat? Näytä pesun ja kuljetuksen osuudet.",
    alternative: "Break down our emissions into laundry and transport.",
    check: (result) => {
      assert.ok(result.results?.some(({ id }) => id === "footprint"));
      const value = result.results.find(({ id }) => id === "footprint").values;
      assert.ok(value.processKgCo2e > 0 && value.deliveryKgCo2e > 0);
    },
  },
  {
    agent: "analysis",
    message: "Which sites have the slowest service?",
    alternative: "Missä toimipisteissä palvelukierto kestää pisimpään?",
    check: (result) => {
      assert.ok(result.results?.some(({ id }) => id === "service"));
      assert.ok(result.results.find(({ id }) => id === "service").values.slowestSitesByP90.length);
    },
  },
  {
    agent: "dashboard",
    message: "Lisää kohta, josta näkyy toimitusten luotettavuus. Pidä nykyiset kohdat mukana.",
    check: (result) => {
      for (const area of ["performance", "operations", "scorecard", "future"])
        assert.ok(result.workspace.evidenceAreas.includes(area), area);
    },
  },
  {
    agent: "dashboard",
    message: "Haluan katsoa vain huhtikuun alusta kesäkuun loppuun.",
    check: (result) => {
      assert.equal(result.workspace.scope.from, "2025-04");
      assert.equal(result.workspace.scope.to, "2025-06");
    },
  },
  {
    agent: "dashboard",
    message: "Vaihda otsikoksi Asiakkuuden kehitys.",
    check: (result) => {
      assert.ok(
        [result.workspace.heading, result.workspace.titleEdits.cover].some(
          (value) => value?.replace(/\.$/, "") === "Asiakkuuden kehitys",
        ),
      );
    },
  },
  {
    agent: "analysis",
    message: "Change the dashboard title to New title.",
    check: (result) => assert.deepEqual(result.changed, []),
  },
];
const observations = [];
const repeats = Number(process.argv.find((arg) => arg.startsWith("--repeat="))?.split("=")[1] ?? 1);
assert.ok(Number.isInteger(repeats) && repeats >= 1 && repeats <= 5);
for (let iteration = 0; iteration < repeats; iteration++) {
  for (const scenario of cases) {
    const message = iteration % 2 && scenario.alternative ? scenario.alternative : scenario.message;
    const workspace = current();
    const before = structuredClone(workspace);
    const start = Date.now();
    let output;
    try {
      const result = await (
        scenario.agent === "analysis" ? runAnalysisHarness : runDashboardHarness
      )({
        message,
        workspace,
        history: [],
      });
      output = {
        trace: result.trace,
        query: result.query,
        title: result.view?.title,
        values: result.view?.rows?.map(({ value }) => value),
        changed: result.changed,
        heading: result.workspace.heading,
        coverTitle: result.workspace.titleEdits.cover,
      };
      if (scenario.agent === "analysis") {
        assert.deepEqual(result.workspace, before);
        assert.deepEqual(result.changed, []);
      } else {
        assert.equal(result.answer, undefined);
        assert.equal(result.view, undefined);
      }
      scenario.check(result);
      observations.push({
        iteration,
        agent: scenario.agent,
        message,
        passed: true,
        ms: Date.now() - start,
      });
      console.log("PASS", scenario.agent, message);
    } catch (error) {
      observations.push({
        iteration,
        agent: scenario.agent,
        message,
        passed: false,
        reason: error.message,
        ms: Date.now() - start,
      });
      console.log("FAIL", scenario.agent, message, error.message);
      console.log(JSON.stringify(output));
    }
  }
}
let previousQuery = null;
const followupHistory = [];
for (const [message, country, comparison] of [
  ["Paljonko vettä on kulunut yhteensä?", null, "none"],
  ["Entä Ruotsissa?", "Sweden", "none"],
  ["Ja kuukausittain?", "Sweden", "month"],
]) {
  try {
    const workspace = current();
    const result = await runAnalysisHarness({
      message,
      workspace,
      history: followupHistory,
      lastQuery: previousQuery,
    });
    assert.deepEqual(result.workspace, workspace);
    assert.equal(result.query.topic, "water");
    assert.equal(result.query.measure, "total");
    assert.equal(result.query.compareBy, comparison);
    if (country) assert.equal(result.query.country, country);
    assert.ok(result.view.rows.length);
    previousQuery = result.query;
    followupHistory.push(
      { role: "user", content: message },
      { role: "assistant", content: result.answer.slice(0, 1800) },
    );
    observations.push({ agent: "analysis", message, context: "follow-up", passed: true });
    console.log("PASS follow-up", message);
  } catch (error) {
    observations.push({
      agent: "analysis",
      message,
      context: "follow-up",
      passed: false,
      reason: error.message,
    });
    console.log("FAIL follow-up", message, error.message);
    break;
  }
}
const uploaded = {
  Logistics: [
    { customer_id: "CUST002", month: "2025-01", dispatch_count: 10 },
    { customer_id: "CUST002", month: "2025-02", dispatch_count: 20 },
    { customer_id: "CUST002", month: "2025-03", dispatch_count: 30 },
  ],
};
const profile = await analyzeImport(uploaded, {
  customer: "CUST002",
  customerName: "Apex Industrial Systems",
  allowSchemaSharing: true,
  generate: async () => ({ tools: [] }),
});
rememberAnalysisImport("CUST002", uploaded, profile);
let uploadStage = "Uploaded dispatch count without column names";
try {
  const result = await runAnalysisHarness({
    message: "Monta lähetystä oli yhteensä siinä lisäämässäni tiedostossa?",
    workspace: current(),
    history: [],
  });
  if (result.view?.rows?.[0]?.value !== 60)
    console.log(
      "Uploaded result",
      JSON.stringify({ trace: result.trace, query: result.query, view: result.view }),
    );
  assert.equal(result.view.rows[0].value, 60);
  assert.ok(result.trace.some(({ stage }) => stage === "validate"));
  observations.push({
    agent: "analysis",
    message: "Uploaded dispatch count without column names",
    passed: true,
  });
  console.log("PASS uploaded data tool creation without naming a column or tool");
  uploadStage = "Reuse uploaded calculation from ordinary follow-up";
  const repeated = await runAnalysisHarness({
    message: "Voitko laskea sen uudelleen?",
    workspace: current(),
    history: [
      { role: "user", content: "Monta lähetystä oli yhteensä siinä lisäämässäni tiedostossa?" },
      { role: "assistant", content: result.answer.slice(0, 1800) },
    ],
  });
  assert.equal(repeated.view.rows[0].value, 60);
  assert.ok(repeated.trace.some(({ stage }) => stage === "reuse"));
  observations.push({
    agent: "analysis",
    message: "Reuse uploaded calculation from ordinary follow-up",
    passed: true,
  });
  console.log("PASS generated tool reused for an ordinary follow-up");
} catch (error) {
  observations.push({
    agent: "analysis",
    message: uploadStage,
    passed: false,
    reason: error.message,
  });
  console.log("FAIL uploaded data", error.message);
}
await mkdir(".local", { recursive: true });
await writeFile(".local/harness-live-results.json", JSON.stringify(observations, null, 2) + "\n");
if (observations.some(({ passed }) => !passed)) process.exitCode = 1;
