import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeWorkspace,
  applyChatPatch,
  runReviewChat,
  validateChatInput,
  chatSchema,
} from "../backend/review-chat.mjs";
import { buildPresentation } from "../backend/presentation-model.mjs";
const workspace = () => normalizeWorkspace({ scope: {} });
const patch = (changes = {}) => ({
  ...Object.fromEntries(chatSchema.required.map((k) => [k, null])),
  scope: Object.fromEntries(chatSchema.properties.scope.required.map((k) => [k, null])),
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
