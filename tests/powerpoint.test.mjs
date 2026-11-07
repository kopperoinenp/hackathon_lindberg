import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import {
  buildPresentation,
  applyPlan,
  defaultPlan,
  validateRequest,
} from "../backend/presentation-model.mjs";
import { generatePlan, providerConfig } from "../backend/ai-provider.mjs";
import { renderPowerPoint } from "../backend/powerpoint.mjs";
const request = {
  scope: { customer: "CUST001", from: "2025-01", to: "2025-03", country: "Finland" },
  included: ["water", "repairs", "opportunity"],
  titleEdits: { water: "Oma otsikko" },
  note: "Sovitaan seuranta.",
};
test("export recalculates scoped values from the fixture and retains mandatory evidence", () => {
  const deck = buildPresentation(request);
  assert.ok(
    Math.abs(deck.slides.find((s) => s.id === "water").chart.values[0] - 484.2803) < 0.000001,
  );
  assert.equal(
    deck.slides.find((s) => s.id === "repairs").chart.values.reduce((a, b) => a + b, 0),
    2206,
  );
  assert.ok(
    deck.slides
      .find((s) => s.id === "plan")
      .paragraphs.at(-1)
      .includes(request.note),
  );
  assert.deepEqual(
    deck.slides.slice(-1).map((s) => s.id),
    ["sources"],
  );
  assert.throws(() =>
    validateRequest({ ...request, scope: { customer: "CUST002", site: "SITE001" } }),
  );
  assert.throws(() => validateRequest({ ...request, included: [] }));
  assert.throws(() => buildPresentation({ ...request, scope: { from: "2025-09", to: "2025-02" } }));
});
test("AI can rank approved insights and choose headlines but cannot change facts or explicit edits", () => {
  const base = buildPresentation(request),
    plan = defaultPlan(base);
  plan.order.reverse();
  plan.headlines.forEach((c) => (c.choice = 1));
  const deck = applyPlan(base, plan);
  assert.throws(() => applyPlan(base, { ...plan, unsupportedClaim: "Invented savings" }));
  assert.equal(deck.slides[1].id, "overview");
  assert.equal(deck.slides[2].id, "repairs");
  assert.equal(deck.slides.at(-3).id, "opportunity");
  assert.throws(() => applyPlan(base, { ...plan, order: ["opportunity", ...plan.order] }));
  assert.equal(deck.slides.find((s) => s.id === "water").title, "Oma otsikko");
  assert.deepEqual(
    deck.slides.find((s) => s.id === "water").chart,
    base.slides.find((s) => s.id === "water").chart,
  );
  assert.throws(() => applyPlan(base, { ...plan, order: ["water", "water", "limits"] }));
  assert.throws(() => applyPlan(base, { ...plan, headlines: [null, ...plan.headlines.slice(1)] }));
  assert.throws(() =>
    applyPlan(base, { ...plan, headlines: plan.headlines.map((c) => ({ ...c, choice: 99 })) }),
  );
});
test("OpenAI adapter uses strict Responses output without exposing credentials", async () => {
  const deck = buildPresentation(request),
    plan = defaultPlan(deck);
  const result = await generatePlan(deck, {
    env: { OPENAI_API_KEY: "test-key" },
    fetchImpl: async (url, init) => {
      assert.equal(url, "https://api.openai.com/v1/responses");
      const body = JSON.parse(init.body);
      assert.equal(init.redirect, "error");
      assert.equal(body.store, false);
      assert.equal(body.text.format.strict, true);
      assert.equal(init.headers.Authorization, "Bearer test-key");
      assert.ok(!init.body.includes("test-key"));
      assert.ok(!Object.hasOwn(body, "tools"));
      return Response.json({
        status: "completed",
        output: [
          { type: "message", content: [{ type: "output_text", text: JSON.stringify(plan) }] },
        ],
      });
    },
  });
  assert.deepEqual(result, plan);
  assert.equal(providerConfig({ OPENAI_API_KEY: "not-shared" }).configured, true);
  assert.ok(
    !JSON.stringify(providerConfig({ OPENAI_API_KEY: "not-shared" })).includes("not-shared"),
  );
  await assert.rejects(() => generatePlan(deck, { env: {} }), /API key/);
  await assert.rejects(
    () =>
      generatePlan(deck, {
        env: { OPENAI_API_KEY: "test-key" },
        fetchImpl: async () => Response.json({}, { status: 401 }),
      }),
    /authentication failed/,
  );
});
test("Copilot adapter returns the same plan shape and disables web grounding", async () => {
  const deck = buildPresentation(request),
    plan = defaultPlan(deck);
  let calls = 0;
  const result = await generatePlan(deck, {
    env: { PRESENTATION_PROVIDER: "copilot", COPILOT_ACCESS_TOKEN: "test-token" },
    fetchImpl: async (url, init) => {
      calls++;
      if (calls === 1) {
        assert.equal(url, "https://graph.microsoft.com/beta/copilot/conversations");
        return Response.json({ id: "test-conversation" });
      }
      assert.ok(url.endsWith("/test-conversation/chat"));
      assert.equal(JSON.parse(init.body).contextualResources.webContext.isWebEnabled, false);
      return Response.json({ messages: [{ text: JSON.stringify(plan) }] });
    },
  });
  assert.equal(calls, 2);
  assert.deepEqual(result, plan);
});
test("PowerPoint export contains editable chart data, sources, notes and scope", async () => {
  const base = buildPresentation(request),
    deck = applyPlan(base, defaultPlan(base));
  const bytes = await renderPowerPoint(deck);
  const zip = await JSZip.loadAsync(bytes);
  const slides = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
  const charts = Object.keys(zip.files).filter((name) => /^ppt\/charts\/chart\d+\.xml$/.test(name));
  assert.equal(slides.length, 7);
  assert.equal(charts.length, 2);
  const xml = (await Promise.all(slides.map((name) => zip.file(name).async("string")))).join("\n");
  assert.match(xml, /Oma otsikko/);
  assert.match(xml, /Synthetic data/);
  assert.match(xml, /2025-01/);
  assert.match(xml, /About the figures/);
  assert.match(xml, /Sovitaan seuranta/);
  const types = await zip.file("[Content_Types].xml").async("string");
  for (const match of types.matchAll(/<Override\b[^>]*PartName="([^"]+)"/g))
    assert.ok(zip.file(match[1].slice(1)), `Missing OOXML part: ${match[1]}`);
  assert.ok(zip.file("ppt/slideMasters/lindstrom-slideMaster1.xml"));
  assert.ok(zip.file("ppt/slideLayouts/lindstrom-slideLayout19.xml"));
  const theme = await zip.file("ppt/theme/lindstrom-theme1.xml").async("string");
  assert.match(theme, /Libre Franklin Black/);
  assert.match(theme, /Libre Franklin/);
  const chartXml = await zip.file(charts[0]).async("string");
  assert.match(chartXml, /<c:externalData/);
  assert.ok(
    Object.keys(zip.files).some(
      (name) => name.startsWith("ppt/embeddings/") && name.endsWith(".xlsx"),
    ),
  );
  assert.ok(
    Object.keys(zip.files).some((name) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name)),
  );
});

test("provider rejects oversized payloads and unexpected tool calls without retries", async () => {
  const deck = buildPresentation(request);
  let calls = 0;
  await assert.rejects(
    () =>
      generatePlan(deck, {
        env: { OPENAI_API_KEY: "test-key" },
        fetchImpl: async () => {
          calls++;
          return new Response("x".repeat(270000));
        },
      }),
    /size limit/,
  );
  assert.equal(calls, 1);
  await assert.rejects(
    () =>
      generatePlan(deck, {
        env: { OPENAI_API_KEY: "test-key" },
        fetchImpl: async () =>
          Response.json({ status: "completed", output: [{ type: "function_call" }] }),
      }),
    /invalid/,
  );
});

test("internal relationship assessments stay out of preview and PowerPoint slides", async () => {
  assert.equal(validateRequest({ scope: {} }).cooperation, "unrated");
  assert.throws(() => validateRequest({ scope: {}, cooperation: "excellent" }));
  for (const status of ["green", "yellow", "red", "unrated"]) {
    const base = buildPresentation({ ...request, cooperation: status });
    const deck = applyPlan(base, defaultPlan(base));
    assert.ok(deck.slides.every((slide) => !Object.hasOwn(slide, "cooperation")));
    // The exporter must also ignore previously cached decks carrying the old badge.
    deck.slides.forEach((slide) => {
      slide.cooperation = { status, color: "E52330", label: "INTERNAL_RELATIONSHIP" };
    });
    const zip = await JSZip.loadAsync(await renderPowerPoint(deck));
    for (const file of Object.keys(zip.files).filter((name) =>
      /^ppt\/slides\/slide\d+\.xml$/.test(name),
    )) {
      const xml = await zip.file(file).async("string");
      assert.ok(!xml.includes("INTERNAL_RELATIONSHIP"));
      assert.ok(!xml.includes("Relationship:"));
    }
  }
});

test("Finnish charts use localized editable category labels without crowded numeric point labels", async () => {
  const base = buildPresentation({ scope: {}, language: "fi" });
  const deck = applyPlan(base, defaultPlan(base));
  const zip = await JSZip.loadAsync(await renderPowerPoint(deck));
  const entries = Object.keys(zip.files).filter((name) =>
    /^ppt\/charts\/chart\d+\.xml$/.test(name),
  );
  const charts = await Promise.all(entries.map((name) => zip.file(name).async("string")));
  assert.ok(charts.length >= 2);
  const water = await zip.file("ppt/slides/slide3.xml").async("string");
  assert.ok(water.includes("Lindström") && water.includes("m³"));
  assert.ok(charts.every((xml) => !xml.includes('showVal val="1"')));
  assert.ok(charts.every((xml) => !xml.includes("items")));
});
