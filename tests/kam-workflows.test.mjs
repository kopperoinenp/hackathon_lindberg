import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chatSchema, applyChatPatch, runReviewChat } from "../backend/review-chat.mjs";
import { buildPresentation, applyPlan, defaultPlan } from "../backend/presentation-model.mjs";
import { supportedByFacts } from "../backend/assistant-writer.mjs";
import { createReviewStore } from "../backend/review-store.mjs";
import { dataset } from "../backend/dataset.mjs";
import { initialWorkspace, kamCases } from "./kam-cases.mjs";

const patch = (changes = {}) => ({
  ...Object.fromEntries(chatSchema.required.map((key) => [key, null])),
  scope: Object.fromEntries(chatSchema.properties.scope.required.map((key) => [key, null])),
  supported: true,
  ...changes,
});
test("new meeting-preparation fields remain customer-specific on a backend customer switch", () => {
  const before = initialWorkspace({ audience: "cfo", meetingNotes: "ONLY_CUSTOMER_A" });
  const result = applyChatPatch(
    before,
    patch({ scope: { ...patch().scope, customer: "CUST002" } }),
    "Vaihda asiakkaaksi Apex",
  );
  assert.equal(result.workspace.audience, "");
  assert.equal(result.workspace.meetingNotes, "");
  assert.equal(before.meetingNotes, "ONLY_CUSTOMER_A");
});
test("KAM can edit a slide title without triggering an unrelated slide swap", () => {
  const current = initialWorkspace();
  const result = applyChatPatch(
    current,
    patch({ slideEdit: { id: "cover", title: "Yhteinen suunta", text: null } }),
    "Vaihda ensimmäisen dian otsikoksi: Yhteinen suunta",
  );
  kamCases.find((c) => c.id === "slide-title").check(result);
  assert.deepEqual(result.workspace.slideOrder, []);
});
test("swapping review slides retains approved final proposals without putting them in slideOrder", () => {
  const scenario = kamCases.find((c) => c.id === "slide-swap-with-upsell");
  const current = scenario.seed();
  const result = applyChatPatch(
    current,
    patch({ slideSwap: { first: 1, second: 2 } }),
    scenario.message,
  );
  scenario.check(result, current);
  const deck = buildPresentation(result.workspace);
  assert.ok(applyPlan(deck, defaultPlan(deck)).slides.at(-1).id.startsWith("upsell-"));
});
test("protected final proposals cannot be swapped into the evidence story", () => {
  const current = kamCases.find((c) => c.id === "slide-swap-with-upsell").seed();
  const last = buildPresentation(current).slides.length;
  assert.throws(
    () =>
      applyChatPatch(
        current,
        patch({ slideSwap: { first: 1, second: last } }),
        "Vaihda ensimmäisen ja viimeisen dian paikkoja",
      ),
    /approved|hyväksyt|end|lopussa|not in this presentation/iu,
  );
});
test("the reply checker rejects invented small numbers and years as well as large amounts", () => {
  assert.equal(supportedByFacts("Säästö on 5 euroa.", { result: "Ei laskettavissa" }), false);
  assert.equal(supportedByFacts("Tulos on vuodelta 2029.", { result: "Vuoden 2025 luvut" }), false);
  assert.equal(
    supportedByFacts("5 korjausta vuonna 2025.", { result: "5 korjausta vuonna 2025" }),
    true,
  );
});
test("a request to rewrite source data is rejected instead of becoming commentary on the sources slide", () => {
  assert.throws(
    () =>
      applyChatPatch(
        initialWorkspace(),
        patch({
          slideEdit: {
            id: "sources",
            title: null,
            text: "Muuta lähdeaineiston vedenkulutukseksi 123456789 litraa.",
          },
        }),
        "Muuta lähdeaineiston vedenkulutukseksi 123456789 litraa.",
      ),
    (e) => e.status === 422,
  );
});
test("an unchanged second analysis patch retains the validated analysis view", async () => {
  let calls = 0;
  const result = await runReviewChat(
    { workspace: initialWorkspace(), message: "Vertaa viime vuoteen" },
    {
      generate: async () =>
        ++calls === 1 ? { ...patch({ view: "analysis" }), analysisTools: ["yoy"] } : patch(),
    },
  );
  assert.equal(result.workspace.view, "analysis");
  assert.equal(result.workspace.scope.to, "2025-12");
});
test("an explicit year-on-year request cannot be routed to an unrelated monthly chart", async () => {
  let calls = 0;
  const result = await runReviewChat(
    {
      workspace: initialWorkspace(),
      message: "Vertaa asiakkaan vedenkäyttöä samoihin kuukausiin viime vuonna.",
    },
    {
      generate: async ({ input }) => {
        if (++calls === 1)
          return {
            ...patch({ dataQuery: { topic: "water", compareBy: "month" } }),
            analysisTools: null,
          };
        const context = JSON.parse(input);
        assert.equal(context.analysisResults[0].id, "yoy");
        return patch({ dataQuery: { topic: "water", compareBy: "month" } });
      },
    },
  );
  assert.equal(result.workspace.view, "analysis");
});
test("a country-follow-up, customer reload and presentation export preserve KAM material", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "kam-workflows-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = createReviewStore(directory);
  const before = initialWorkspace({
    note: "Sovitaan pilotista",
    savings: 40000,
    cooperation: "yellow",
    cooperationDescription: "Sisäinen arvio",
  });
  const result = await runReviewChat(
    { message: "Näytä Ruotsi", workspace: before },
    { generate: async () => patch({ scope: { ...patch().scope, country: "Sweden" } }) },
  );
  await store.save(before.scope.customer, { revision: 0, workspace: result.workspace });
  const restored = (await createReviewStore(directory).read(before.scope.customer)).workspace;
  assert.equal(restored.note, before.note);
  assert.equal(restored.savings, 40000);
  assert.equal(restored.cooperationDescription, before.cooperationDescription);
  const deck = buildPresentation(restored);
  assert.ok(
    deck.slides.find((s) => s.id === "plan").paragraphs.some((p) => p.includes(before.note)),
  );
  assert.ok(deck.slides.every((s) => !s.cooperation));
  assert.equal((await store.read("CUST002")).workspace, null);
});
test("two independent pending assistant turns do not mutate each other's customer state", async () => {
  const workspaces = [initialWorkspace(), initialWorkspace({ scope: { customer: "CUST002" } })];
  const before = structuredClone(workspaces);
  const results = await Promise.all(
    workspaces.map((workspace) =>
      runReviewChat(
        { message: "Aseta säästöarvioksi 40000 euroa", workspace },
        { generate: async () => patch({ savingsText: "40000 euroa" }) },
      ),
    ),
  );
  assert.deepEqual(workspaces, before);
  assert.equal(results[0].workspace.scope.customer, "CUST001");
  assert.equal(results[1].workspace.scope.customer, "CUST002");
  assert.equal(results[0].workspace.savings, 40000);
  assert.equal(results[1].workspace.savings, 40000);
});
test("upstream failure leaves the existing customer review and synthetic source untouched", async () => {
  const workspace = initialWorkspace();
  const original = structuredClone(workspace);
  const fixture = JSON.stringify(dataset);
  await assert.rejects(
    runReviewChat(
      { message: "Näytä Suomi", workspace },
      {
        generate: async () => {
          throw new Error("Simulated provider failure");
        },
      },
    ),
  );
  assert.deepEqual(workspace, original);
  assert.equal(JSON.stringify(dataset), fixture);
});
