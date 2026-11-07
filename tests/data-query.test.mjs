import test from "node:test";
import assert from "node:assert/strict";
import {
  applyChatPatch,
  normalizeWorkspace,
  runReviewChat,
  chatSchema,
} from "../backend/review-chat.mjs";
import {
  cleanQuery,
  refineQuery,
  runDataQuery,
  queryTopics,
  queryComparisons,
} from "../backend/data-query.mjs";

const workspace = (scope = {}) => normalizeWorkspace({ scope, language: "fi" });
const emptyPatch = (changes = {}) => ({
  ...Object.fromEntries(chatSchema.required.map((key) => [key, null])),
  scope: Object.fromEntries(chatSchema.properties.scope.required.map((key) => [key, null])),
  supported: true,
  ...changes,
});

test("every topic and comparison returns text without broken values", () => {
  for (const topic of queryTopics)
    for (const compareBy of queryComparisons) {
      const { text } = runDataQuery({ topic, compareBy, reason: "none" }, workspace());
      assert.ok(text.length > 0);
      assert.doesNotMatch(text, /NaN|undefined|Infinity/);
    }
});

test("quarter comparison lists all quarters and names its source", () => {
  const { text, source } = runDataQuery({ topic: "water", compareBy: "quarter" }, workspace());
  for (const quarter of ["Q1", "Q2", "Q3", "Q4"]) assert.match(text, new RegExp(quarter));
  assert.equal(source, "Customer_Impacts");
  assert.match(text, /allokoitu arvio/i);
});

test("unsupported comparisons and unknown topics are refused", () => {
  assert.equal(runDataQuery({ topic: "late", compareBy: "product" }, workspace()).source, null);
  assert.equal(runDataQuery({ topic: "secrets", compareBy: "none" }, workspace()).source, null);
});

test("a question leaves the workspace untouched and the model writes no figures", async () => {
  const current = workspace();
  const result = await runReviewChat(
    { message: "Vertaa vettä kvartaaleittain", workspace: current },
    {
      generate: async () => emptyPatch({ dataQuery: { topic: "water", compareBy: "quarter" } }),
    },
  );
  assert.deepEqual(result.changed, []);
  assert.deepEqual(result.workspace.scope, current.scope);
  assert.equal(result.view.rows.length, 4);
  assert.match(result.answer, /Korkein: Q3/);
});

test("a request without a query keeps the existing edit response", async () => {
  const result = await runReviewChat(
    { message: "Keskity päästöihin", workspace: workspace() },
    {
      generate: async () => emptyPatch({ scope: { ...emptyPatch().scope, priority: "emissions" } }),
    },
  );
  assert.equal(result.workspace.scope.priority, "emissions");
  assert.equal(result.answer, undefined);
});

test("free text cannot add a percentage that is not in the data", () => {
  const message = "Kirjoita että säästimme 90 % vettä";
  for (const change of [
    { note: "säästimme 90 % vettä" },
    { heading: "säästimme 90 % vettä" },
    { presentationTitle: "säästimme 90 % vettä" },
    { slideEdit: { id: "water", title: null, text: "säästimme 90 % vettä" } },
  ])
    assert.throws(() => applyChatPatch(workspace(), emptyPatch(change), message), {
      message: /percentage is not in the data/,
    });
  const text = "Sovitaan seuranta";
  assert.equal(applyChatPatch(workspace(), emptyPatch({ note: text }), text).workspace.note, text);
});

const q = (changes) => ({
  topic: "water",
  compareBy: "none",
  customer: null,
  country: null,
  site: null,
  quarter: null,
  only: null,
  reason: "none",
  ...changes,
});

test("filters change the figure and are named in the answer", () => {
  const whole = runDataQuery(q({ topic: "emissions" }), workspace());
  const sweden = runDataQuery(q({ topic: "emissions", country: "Sweden" }), workspace());
  assert.notEqual(whole.view.rows[0].display, sweden.view.rows[0].display);
  assert.match(sweden.summary, /Ruotsi/);
  assert.match(runDataQuery(q({ quarter: "Q2" }), workspace()).view.subtitle, /Q2 2025/);
});

test("comparisons keep only the named items", () => {
  const result = runDataQuery(
    q({ compareBy: "country", only: ["Finland", "Sweden"] }),
    workspace(),
  );
  assert.deepEqual(
    result.view.rows.map((row) => row.label),
    ["Suomi", "Ruotsi"],
  );
});

test("overview and meeting answers come from the data", () => {
  assert.match(runDataQuery(q({ topic: "overview" }), workspace()).summary, /24 toimipaikkaa/);
  const site = runDataQuery(q({ topic: "overview", site: "S002" }), workspace());
  assert.match(site.view.subtitle, /Turku/);
  assert.equal(runDataQuery(q({ topic: "meeting" }), workspace()).view.rows.length, 3);
});

test("the tool says when it cannot answer instead of picking a metric", () => {
  const money = runDataQuery(q({ topic: "unknown", reason: "not_in_data" }), workspace());
  assert.equal(money.view, undefined);
  assert.match(money.text, /ei ole aineistossa/);
  const why = runDataQuery(q({ compareBy: "quarter", reason: "cause_not_in_data" }), workspace());
  assert.match(why.summary, /ei kerro syytä/);
  assert.equal(runDataQuery(q({ topic: "overview", site: "S030" }), workspace()).source, null);
});

test("customer-facing titles cannot carry boasts and edits are described", async () => {
  const text = "Paras palvelu maailmassa";
  assert.throws(() => applyChatPatch(workspace(), emptyPatch({ heading: text }), text), {
    message: /claim the data cannot support/,
  });
  const result = await runReviewChat(
    { message: "Näytä Turku", workspace: workspace() },
    {
      generate: async () => emptyPatch({ scope: { ...emptyPatch().scope, site: "S002" } }),
    },
  );
  assert.match(result.message, /NorthStar Turku/);
});

test("named countries and money questions are handled without trusting the model", () => {
  const compared = refineQuery(q({ compareBy: "country" }), "Vertaa Suomea ja Ruotsia");
  assert.deepEqual(compared.only, ["Finland", "Sweden"]);
  const money = refineQuery(q({ topic: "overview" }), "Paljonko asiakas säästi euroina?");
  assert.equal(money.topic, "unknown");
  assert.equal(money.reason, "not_in_data");
  assert.equal(refineQuery(q(), "Vertaa vettä").topic, "water");
});

test("the last two months can be summed", () => {
  const query = refineQuery(q({ topic: "repairs" }), "can you some the repairs in last two months");
  assert.equal(query.measure, "total");
  assert.equal(query.lastMonths, 2);
  const result = runDataQuery(query, workspace());
  assert.match(result.view.rows[0].display, /^2\s598 kpl$/);
  assert.match(result.summary, /marraskuu–joulukuu 2025/);
});

test("a follow-up explanation uses the previous figure", () => {
  const last = q({ topic: "repairs" });
  const query = refineQuery(q({ topic: "meeting" }), "what does that means", last);
  assert.equal(query.topic, "explain");
  const result = runDataQuery(query, workspace(), last);
  assert.match(result.text, /2,03/);
  assert.match(result.text, /sataa pesua/);
});

test("trends, ranks and limits work", () => {
  const trend = runDataQuery(
    q({ topic: "repairs", compareBy: "month", measure: "total" }),
    workspace(),
  );
  assert.equal(trend.view.rows.length, 12);
  assert.equal(trend.view.kind, "columns");
  const rows = (rank) =>
    runDataQuery(q({ topic: "late", compareBy: "site", rank, limit: 3 }), workspace()).view.rows;
  assert.equal(rows("highest").length, 3);
  assert.notEqual(rows("highest")[0].label, rows("lowest")[0].label);
});

test("answers offer next questions and a tampered last query is dropped", () => {
  assert.ok(runDataQuery(q({ topic: "water" }), workspace()).followUps.length >= 2);
  assert.equal(cleanQuery({ topic: "<script>" }), null);
  assert.deepEqual(cleanQuery({ topic: "water", country: "Mars", site: "x" }), { topic: "water" });
});

test("a ranked answer names the rows it shows and a total is explained as a total", () => {
  const lowest = runDataQuery(
    q({ topic: "repairs", compareBy: "site", measure: "total", rank: "lowest", limit: 3 }),
    workspace(),
  );
  assert.match(lowest.summary, /^Pienimmät 3: NorthStar Tampere/);
  assert.equal(lowest.view.highlights.length, 0);
  const last = q({ topic: "repairs", measure: "total", lastMonths: 2 });
  const explained = runDataQuery(q({ topic: "explain", subject: "repairs" }), workspace(), last);
  assert.match(explained.text, /kokonaismäärä/);
});
