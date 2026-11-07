import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeWorkspace,
  applyChatPatch,
  runReviewChat,
  validateChatInput,
  chatSchema,
} from "../backend/review-chat.mjs";
import { buildPresentation, applyPlan, defaultPlan } from "../backend/presentation-model.mjs";
const workspace = () => normalizeWorkspace({ scope: {} });
const patch = (changes = {}) => ({
  ...Object.fromEntries(chatSchema.required.map((k) => [k, null])),
  scope: Object.fromEntries(chatSchema.properties.scope.required.map((k) => [k, null])),
  supported: true,
  ...changes,
});
const scoped = (changes) => patch({ scope: { ...patch().scope, ...changes } });
test("chat changes scope atomically and export retains the same selection", () => {
  const current = workspace(),
    before = structuredClone(current);
  const p = scoped({ country: "Finland", from: "2025-01", to: "2025-03", priority: "emissions" });
  Object.assign(p, {
    visibleInsights: ["water", "emissions"],
    included: ["water", "emissions"],
  });
  const result = applyChatPatch(current, p, "Suomen alkuvuosi ja päästöt");
  assert.deepEqual(current, before);
  assert.equal(result.workspace.scope.to, "2025-03");
  assert.equal(result.workspace.scope.priority, "emissions");
  assert.deepEqual(result.workspace.included, ["water", "emissions"]);
  const deck = buildPresentation(result.workspace);
  assert.equal(result.reply, "Valmis");
  assert.ok(!deck.slides.some((s) => s.id === "repairs"));
  for (const id of ["overview", "sources", "limits"])
    assert.ok(deck.slides.some((s) => s.id === id));
  const followup = applyChatPatch(result.workspace, scoped({ country: "Sweden" }), "Entä Ruotsi?");
  assert.equal(followup.workspace.scope.from, "2025-01");
  assert.equal(followup.workspace.scope.to, "2025-03");
  assert.equal(followup.workspace.scope.priority, "emissions");
  assert.equal(followup.workspace.scope.country, "Sweden");
});
test("customer switch clears customer-specific material and presentation selections", () => {
  const current = normalizeWorkspace({
    scope: {},
    note: "Vanha",
    heading: "Vanha",
    titleEdits: { cover: "Vanha" },
    included: ["water"],
    visibleInsights: ["water"],
  });
  const result = applyChatPatch(
    current,
    scoped({ customer: "CUST002" }),
    "Vaihda asiakkaaksi CUST002",
  ).workspace;
  assert.equal(result.note, "");
  assert.equal(result.heading, "");
  assert.deepEqual(result.titleEdits, {});
  assert.equal(result.included.length, 4);
  assert.equal(result.visibleInsights.length, 4);
});
test("invalid patches cannot mutate the current workspace or manufacture text", () => {
  const current = workspace(),
    before = structuredClone(current);
  const foreignSite = globalThis.REVIEW_DATA.sites.find(
    (s) => s.customer_id !== current.scope.customer,
  ).site_id;
  const invalid = [
    scoped({ country: "Germany" }),
    scoped({ from: "2025-12", to: "2025-01" }),
    scoped({ site: foreignSite }),
    patch({ included: [] }),
    patch({ visibleInsights: [] }),
    patch({ heading: "Invented claim" }),
    patch({ javascript: "alert(1)" }),
    patch({ question: "Mikä maa?", view: "analysis" }),
  ];
  for (const p of invalid) assert.throws(() => applyChatPatch(current, p, "Näytä tiedot"));
  assert.deepEqual(current, before);
});
test("explicit text works and no-op returns a short status", () => {
  const result = applyChatPatch(
    workspace(),
    patch({
      heading: "Vuoden asiakasarvo",
      note: "Sovitaan seuranta",
      presentationTitle: "Vuoden asiakasarvo",
    }),
    "Otsikko: Vuoden asiakasarvo. Muistiinpano: Sovitaan seuranta",
  );
  assert.equal(result.workspace.heading, "Vuoden asiakasarvo");
  assert.equal(result.workspace.titleEdits.cover, "Vuoden asiakasarvo");
  assert.equal(result.workspace.note, "Sovitaan seuranta");
  const q = applyChatPatch(result.workspace, patch(), "Mitä ajanjaksoa tarkoitat?");
  assert.deepEqual(q.changed, []);
  assert.deepEqual(q.workspace, result.workspace);
  assert.equal(q.reply, "Ei muutoksia.");
});
test("chat can repair a reversed current period and bounds untrusted history", () => {
  const current = normalizeWorkspace(
    { scope: { from: "2025-12", to: "2025-01" } },
    { allowEmpty: true },
  );
  const fixed = applyChatPatch(
    current,
    scoped({ from: "2025-01", to: "2025-12" }),
    "Näytä koko vuosi",
  );
  assert.equal(fixed.workspace.scope.from, "2025-01");
  assert.throws(() =>
    validateChatInput({
      workspace: workspace(),
      message: "x",
      history: Array(7).fill({ role: "user", content: "x" }),
    }),
  );
  assert.throws(() => validateChatInput({ workspace: workspace(), message: "x".repeat(1001) }));
});
test("provider receives strict patch contract and fresh evidence, failures never become simulated success", async () => {
  const current = workspace();
  const result = await runReviewChat(
    { workspace: current, message: "Painota vettä", history: [] },
    {
      generate: async ({ schema, input }) => {
        assert.equal(schema, chatSchema);
        const parsed = JSON.parse(input);
        assert.deepEqual(parsed.workspace, current);
        assert.ok(parsed.catalog.customers.length === 3);
        assert.ok(parsed.evidence.some((s) => s.id === "water"));
        return scoped({ priority: "water" });
      },
    },
  );
  assert.equal(result.workspace.scope.priority, "water");
  await assert.rejects(
    runReviewChat(
      { workspace: current, message: "Muuta" },
      {
        generate: async () => {
          throw new Error("Provider unavailable");
        },
      },
    ),
    /Provider unavailable/,
  );
  await assert.rejects(
    runReviewChat(
      { workspace: current, message: "Muuta" },
      { env: { PRESENTATION_PROVIDER: "deterministic" } },
    ),
    (e) => e.status === 503,
  );
});

test("explicit slide swap survives AI planning, repeated swaps and unsupported requests cannot report success", async () => {
  const current = workspace();
  const swapped = applyChatPatch(
    current,
    patch({ slideSwap: { first: 1, second: 2 } }),
    "vaihda powerpointin ekan ja toisen dian paikkoja",
  );
  assert.equal(swapped.reply, "Valmis");
  assert.deepEqual(swapped.workspace.slideOrder.slice(0, 2), ["overview", "cover"]);
  const { applyPlan, defaultPlan } = await import("../backend/presentation-model.mjs");
  const base = buildPresentation(swapped.workspace);
  assert.deepEqual(
    applyPlan(base, defaultPlan(base))
      .slides.slice(0, 2)
      .map((s) => s.id),
    ["overview", "cover"],
  );
  const again = applyChatPatch(
    swapped.workspace,
    patch({ slideSwap: { first: 1, second: 2 } }),
    "vaihda diat 1 ja 2",
  );
  assert.deepEqual(again.workspace.slideOrder.slice(0, 2), ["cover", "overview"]);
  for (const p of [
    patch({ slideSwap: { first: 0, second: 2 } }),
    patch({ slideSwap: { first: 1, second: 10 } }),
    patch({ slideSwap: { first: 1, second: 1 } }),
  ])
    assert.throws(() => applyChatPatch(current, p, "vaihda diat"));
  assert.throws(
    () =>
      applyChatPatch(
        current,
        scoped({ priority: "water" }),
        "vaihda powerpointin ekan ja toisen dian paikkoja",
      ),
    /järjestystä ei muutettu/,
  );
  assert.throws(
    () => applyChatPatch(current, patch({ supported: false, heading: "English" }), "English"),
    (e) => e.status === 422,
  );
});

test("KAM tools set monetary estimates, slide commentary and traffic lights without changing evidence", () => {
  const current = workspace();
  const evidence = buildPresentation(current).slides.find((s) => s.id === "water").chart.values;
  const result = applyChatPatch(
    current,
    patch({
      savingsText: "40000EUroa",
      cooperation: "green",
      slideEdit: { id: "plan", title: "Sovitaan seuranta", text: "Tarkistetaan sopimus" },
    }),
    "Haluan, että säästetty raha on 40000EUroa. Yhteistyö sujuu hyvin. Otsikko: Sovitaan seuranta. Teksti: Tarkistetaan sopimus",
  );
  assert.equal(result.workspace.savings, 40000);
  assert.equal(result.workspace.cooperation, "green");
  const draft = buildPresentation(result.workspace);
  const deck = applyPlan(draft, defaultPlan(draft));
  assert.match(deck.slides[0].paragraphs[0], /40\s*000/);
  assert.match(deck.slides[0].paragraphs[0], /KAM:in antama arvio/);
  assert.equal(deck.slides.find((s) => s.id === "plan").title, "Sovitaan seuranta");
  assert.ok(
    deck.slides
      .find((s) => s.id === "plan")
      .paragraphs.includes("KAM:in lisäys: Tarkistetaan sopimus"),
  );
  assert.deepEqual(deck.slides.find((s) => s.id === "water").chart.values, evidence);
  assert.equal(
    applyChatPatch(result.workspace, patch({ savingsText: "" }), "Poista säästöarvio").workspace
      .savings,
    null,
  );
  for (const text of ["90000 euroa", "-400 euroa", "Infinity"])
    assert.throws(() =>
      applyChatPatch(current, patch({ savingsText: text }), "Säästetty raha on 40000EUroa"),
    );
  assert.throws(() =>
    applyChatPatch(
      current,
      patch({ slideEdit: { id: "water", title: "Keksitty väite", text: null } }),
      "Vaihda vesidian otsikko",
    ),
  );
  const switched = applyChatPatch(
    result.workspace,
    scoped({ customer: "CUST002" }),
    "Vaihda asiakkaaksi CUST002",
  );
  assert.equal(switched.workspace.savings, null);
  assert.deepEqual(switched.workspace.managerTexts, {});
});

test("dashboard layout changes structure and selected KPIs rather than creating a goal note", () => {
  const current = workspace();
  const structure = { sections: ["savings", "metrics", "charts"], metrics: ["allocated"] };
  const changed = applyChatPatch(
    current,
    patch({ dashboardLayout: structure, summaryMetric: "emissions", savingsText: "40000 euroa" }),
    "Näytä vain säästetty raha 40000 euroa, vaatemäärä ja päästökaavio",
  );
  assert.deepEqual(changed.workspace.dashboardLayout, structure);
  assert.equal(changed.workspace.summaryMetric, "emissions");
  assert.equal(changed.workspace.note, "");
  assert.ok(changed.changed.includes("dashboardLayout"));
  const followup = applyChatPatch(
    changed.workspace,
    patch({ dashboardLayout: { sections: ["metrics", "charts"], metrics: ["sites", "scanned"] } }),
    "Poista säästöt ja näytä ensin toimipaikat ja skannatut tekstiilit",
  );
  assert.deepEqual(followup.workspace.dashboardLayout.sections, ["metrics", "charts"]);
  for (const bad of [
    { sections: [], metrics: ["sites"] },
    { sections: ["code"], metrics: ["sites"] },
    { sections: ["metrics"], metrics: ["invented"] },
    { sections: ["metrics", "metrics"], metrics: ["sites"] },
  ])
    assert.throws(() =>
      applyChatPatch(current, patch({ dashboardLayout: bad }), "Muuta rakennetta"),
    );
  const before = buildPresentation(current);
  const after = buildPresentation({ ...changed.workspace, savings: null });
  assert.deepEqual(
    after.slides.map((s) => s.id),
    before.slides.map((s) => s.id),
  );
});
