import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import "../frontend/mockups/kopperoinenp/analysis-model.js";
import "../frontend/mockups/kopperoinenp/sales-model.js";
import { applyPlan, buildPresentation, defaultPlan } from "../backend/presentation-model.mjs";
import { generatePlan } from "../backend/ai-provider.mjs";

const source = await readFile(
  new URL("../frontend/mockups/kopperoinenp/data.js", import.meta.url),
  "utf8",
);
const sandbox = {};
vm.runInNewContext(source, sandbox);
const data = sandbox.REVIEW_DATA;
const { audienceAdvice, conversation, salesSignals, usageRead } = globalThis.SalesModel;
const scope = (customer) => ({ customer, from: "2025-01", to: "2025-12" });

test("the usage recommendation follows the data from Lindström's point of view", () => {
  assert.equal(salesSignals(data, scope("CUST001"), "en").usage.read, "decide");
  assert.equal(salesSignals(data, scope("CUST002"), "en").usage.read, "keep");
  assert.equal(salesSignals(data, scope("CUST003"), "en").usage.read, "show");
  assert.equal(usageRead(90, -2), "keep", "Falling use wins over a high level");
  assert.equal(usageRead(86, 0), "show");
});

test("signals use real figures and stay out when there is no data", () => {
  const { usage, signals } = salesSignals(data, scope("CUST002"), "fi");
  assert.match(usage.value, /^81,9 %/);
  assert.match(usage.advice, /rehellisesti/);
  assert.deepEqual(
    signals.map((signal) => signal.id),
    ["volume", "revenue", "site"],
  );
  const empty = { ...scope("CUST002"), from: "2025-12", to: "2025-01" };
  assert.equal(salesSignals(data, empty, "en"), null);
});

test("each role gets areas and honest points in both languages", () => {
  const metrics = {
    water: 1e6,
    emissions: 5000,
    repairs: 10,
    washed: 100,
    sites: 2,
    allocated: 50,
  };
  assert.deepEqual(audienceAdvice("cfo", metrics, "en").areas, [
    "scorecard",
    "financial",
    "operations",
  ]);
  assert.match(audienceAdvice("cfo", metrics, "fi").points[0], /ei ole aineistossa/);
  assert.equal(audienceAdvice("", metrics, "en"), null);
});

test("hidden usage leaves the presentation completely", () => {
  const request = { scope: { customer: "CUST002" }, language: "en" };
  const shown = JSON.stringify(buildPresentation(request));
  const hidden = JSON.stringify(buildPresentation({ ...request, hideUsage: true }));
  assert.match(shown, /scan/i);
  assert.doesNotMatch(hidden, /scan|skann/i);
  const finnish = buildPresentation({ ...request, language: "fi", hideUsage: true });
  assert.doesNotMatch(JSON.stringify(finnish), /scan|skann/i);
});

test("a hidden opportunity slide survives an AI plan that still names it", async () => {
  const deck = buildPresentation({
    scope: { customer: "CUST002" },
    language: "en",
    hideUsage: true,
  });
  const plan = defaultPlan(deck);
  const reply = { ...plan, headlines: [...plan.headlines, { id: "opportunity", choice: 0 }] };
  const result = await generatePlan(deck, {
    env: { OPENAI_API_KEY: "test-key" },
    fetchImpl: async () =>
      Response.json({
        status: "completed",
        output: [
          { type: "message", content: [{ type: "output_text", text: JSON.stringify(reply) }] },
        ],
      }),
  });
  const final = applyPlan(deck, result);
  assert.ok(!final.slides.some((slide) => slide.id === "opportunity"));
  assert.doesNotMatch(JSON.stringify(final.slides), /scan|skann/i);
});

test("meeting questions lead through the customer's needs and never reveal internal figures", () => {
  const apex = salesSignals(data, scope("CUST002"), "fi");
  const questions = conversation("cfo", apex, "fi");
  assert.equal(questions.length, 3);
  assert.match(questions[0].ask, /kustannuksia/);
  assert.match(questions[1].ask, /tarve/);
  assert.match(questions[2].ask, /Apex/);
  for (const { ask } of questions) assert.doesNotMatch(ask, /\d/);
  assert.match(conversation("", null, "en")[0].ask, /most important change/);
  const mediora = conversation("", salesSignals(data, scope("CUST003"), "en"), "en");
  assert.match(mediora[1].why, /customer's own need/);
});

test("search finds a customer among a hundred without listing them all", () => {
  const { matchCustomers } = globalThis.SalesModel;
  const rows = Array.from({ length: 100 }, (_, index) => ({
    id: `C${index}`,
    name: `Asiakas ${index}`,
    industry: index % 2 ? "Teollisuus" : "Terveydenhuolto",
  }));
  rows.push({ id: "N", name: "Nordic Äkäslompolo", industry: "Hotelli" });
  assert.equal(matchCustomers(rows, "").length, 8);
  assert.deepEqual(
    Array.from(matchCustomers(rows, "akaslomp"), ({ id }) => id),
    ["N"],
  );
  assert.equal(matchCustomers(rows, "asiakas 42 teoll").length, 0);
  assert.equal(matchCustomers(rows, "asiakas 43 teoll").at(0).id, "C43");
  assert.equal(matchCustomers(rows, "zzz").length, 0);
});

test("the role shifts the deck's emphasis and internal notes stay out of a sendable file", () => {
  const { audiences } = globalThis.SalesModel;
  assert.equal(audiences.sustainability.priority, "emissions");
  assert.equal(audiences.cfo.priority, "efficiency");
  const scope = { customer: "CUST002", priority: audiences.sustainability.priority };
  const deck = JSON.stringify(
    buildPresentation({
      scope,
      language: "en",
      meetingNotes: "Secret note",
      audience: "sustainability",
    }),
  );
  assert.doesNotMatch(deck, /Secret note|sustainability manager/i);
});

test("hidden usage keeps scan figures out of approved proposals", () => {
  const scope = {
    customer: "CUST002",
    from: "2025-01",
    to: "2025-12",
    country: "all",
    continent: "all",
    site: "all",
    baseline: "B_LOCAL",
    priority: "neutral",
  };
  const { proposals } = globalThis.UpsellModel;
  const usage = Array.from(proposals(data, scope, "en"))[0];
  const approvedUpsells = [{ id: usage.id, evidenceKey: usage.evidenceKey }];
  const request = { scope, language: "en", approvedUpsells };
  assert.match(JSON.stringify(buildPresentation(request)), /upsell-/);
  const hidden = JSON.stringify(buildPresentation({ ...request, hideUsage: true }));
  assert.doesNotMatch(hidden, /scan|skann/i);
});

test("the approved review's areas become slides before the plan", () => {
  const reviewAreas = [
    {
      id: "sustainability",
      title: "Sustainability value",
      headline: "Emissions fell",
      points: ["16.2 t CO2e", "81.9 % scanned"],
      note: "Agreed focus",
    },
  ];
  const request = { scope: { customer: "CUST002" }, language: "en", reviewAreas };
  const deck = buildPresentation(request);
  const planned = applyPlan(deck, defaultPlan(deck));
  const ids = planned.slides.map((slide) => slide.id);
  assert.equal(ids.indexOf("area-sustainability"), ids.indexOf("plan") - 1);
  const slide = planned.slides.find((row) => row.id === "area-sustainability");
  assert.deepEqual(slide.paragraphs, [
    "Emissions fell",
    "16.2 t CO2e",
    "81.9 % scanned",
    "Agreed focus",
  ]);
  const hidden = buildPresentation({ ...request, hideUsage: true });
  assert.doesNotMatch(JSON.stringify(hidden.slides), /scan/i);
  assert.throws(
    () => buildPresentation({ ...request, reviewAreas: [{ id: "X", title: 1 }] }),
    /Invalid review content/,
  );
});

test("a slide chart reaches the deck and a broken one is refused", () => {
  const chart = {
    type: "line",
    name: "On time, % per month",
    labels: ["2025-01", "2025-02"],
    values: [95, null],
    reference: [94, 93],
    referenceName: "2024",
  };
  const area = { id: "performance", title: "Service", headline: "", points: [], note: "", chart };
  const request = { scope: { customer: "CUST002" }, language: "en", reviewAreas: [area] };
  const slide = buildPresentation(request).slides.find((row) => row.id === "area-performance");
  assert.equal(slide.chart.type, "line");
  const broken = { ...area, chart: { ...chart, values: ["x"] } };
  assert.throws(
    () => buildPresentation({ ...request, reviewAreas: [broken] }),
    /Invalid review content/,
  );
});

test("figures show the change from the same months a year earlier", () => {
  const deck = buildPresentation({ scope: { customer: "CUST002" }, language: "en" });
  const find = (id) => deck.slides.find((slide) => slide.id === id);
  const textiles = find("overview").kpis.find((row) => row.label === "Textiles in service");
  assert.match(textiles.delta, /[↑↓→] [+−-]?[\d.,]+ % vs 2024/);
  assert.equal(textiles.tone, "neutral");
  const { trend } = find("water");
  assert.match(trend.delta, /vs 2024$/);
  assert.equal(trend.tone, trend.delta.startsWith("↓") ? "better" : "worse");
  const stat = { value: "81.9 %", label: "scanned", delta: "↑ +3.3 pp vs 2024", tone: "better" };
  const area = {
    id: "adoption",
    title: "Use",
    headline: "",
    points: [],
    note: "",
    stats: [stat, { ...stat, value: "9,207", label: "textiles" }],
  };
  const withArea = buildPresentation({
    scope: { customer: "CUST002" },
    language: "en",
    reviewAreas: [area],
  });
  const slide = withArea.slides.find((row) => row.id === "area-adoption");
  assert.equal(slide.trend.tone, "better");
  assert.equal(slide.kpis[0].delta, stat.delta);
});
