import assert from "node:assert/strict";
import { normalizeWorkspace } from "../backend/review-chat.mjs";
import { dataset } from "../backend/dataset.mjs";
import { figuresIn } from "../backend/assistant-writer.mjs";
import { buildPresentation } from "../backend/presentation-model.mjs";

export const initialWorkspace = (changes = {}) =>
  normalizeWorkspace({ scope: { customer: "CUST001" }, language: "fi", ...changes });
const unchanged = (r, before) =>
  assert.deepEqual(r.workspace, before, "A question must not change the customer's review");
const answer = (r) => {
  assert.ok(r.answer?.trim(), "KAM needs a readable answer");
};
const country = (value) => (r) => assert.equal(r.workspace.scope.country, value);
const withApproval = () => {
  const state = initialWorkspace();
  const p = globalThis.UpsellModel.proposals(dataset, state.scope)[0];
  state.approvedUpsells = [{ id: p.id, evidenceKey: p.evidenceKey }];
  return state;
};
export const kamCases = [
  {
    id: "greeting",
    message: "Moi",
    check(r, w) {
      answer(r);
      unchanged(r, w);
    },
  },
  {
    id: "thanks",
    message: "Kiitos",
    check(r, w) {
      answer(r);
      unchanged(r, w);
    },
  },
  { id: "empty", message: "   ", error: [400] },
  { id: "too-long", message: "x".repeat(1001), error: [400] },
  {
    id: "textile-count",
    message: "Paljonko tällä asiakkaalla on tällä hetkellä vaatteita?",
    check(r, w) {
      answer(r);
      unchanged(r, w);
      const m = globalThis.WorkspaceModel.summarize(
        globalThis.WorkspaceModel.select(dataset, w.scope),
      );
      assert.ok(
        figuresIn(r.answer + JSON.stringify(r.view)).includes(m.allocated),
        "Textile count must match the latest snapshot",
      );
    },
  },
  {
    id: "repair-count",
    message: "Montako korjausta asiakkaalle tehtiin vuonna 2025 yhteensä?",
    check(r, w) {
      answer(r);
      unchanged(r, w);
      const m = globalThis.WorkspaceModel.summarize(
        globalThis.WorkspaceModel.select(dataset, w.scope),
      );
      assert.ok(
        figuresIn(r.answer + JSON.stringify(r.view)).includes(m.repairs),
        "Repairs must be the period total",
      );
    },
  },
  {
    id: "water-source",
    message: "Paljonko vettä asiakkaan pesuihin käytettiin yhteensä vuonna 2025?",
    check(r, w) {
      answer(r);
      unchanged(r, w);
      assert.ok(r.source);
      assert.equal(r.query.topic, "water");
      assert.equal(r.query.measure, "total");
    },
  },
  {
    id: "missing-cross-sell-savings",
    message: "Paljonko hygieniapalvelu säästäisi asiakkaalle euroissa?",
    check(r, w) {
      answer(r);
      unchanged(r, w);
      assert.ok(
        /puutt|ei ole|ei löyd|ei sisäl|ei voi|tarvit|en voi|ei tied|ei ole saatav|arvioida/iu.test(
          r.answer,
        ),
      );
      assert.equal(r.workspace.savings, null);
    },
  },
  {
    id: "unavailable-profit",
    message: "Mikä on asiakkaan tarkka liikevoitto vuonna 2025?",
    check(r, w) {
      answer(r);
      unchanged(r, w);
      assert.ok(/ei |puutt|en voi|en osaa|tarvit/iu.test(r.answer));
    },
  },
  { id: "country", message: "Näytä vain Ruotsin toimipisteet.", check: country("Sweden") },
  {
    id: "follow-up-country",
    seed: () =>
      initialWorkspace({
        scope: { customer: "CUST001", country: "Sweden", from: "2025-01", to: "2025-03" },
        note: "Sovitaan seuranta",
      }),
    history: [{ role: "user", content: "Näytä Ruotsin alkuvuosi." }],
    message: "Entä Suomessa?",
    check(r) {
      country("Finland")(r);
      assert.equal(r.workspace.scope.to, "2025-03");
      assert.equal(r.workspace.note, "Sovitaan seuranta");
    },
  },
  {
    id: "quarter",
    message: "Rajaa näkymä Suomeen ja vuoden 2025 ensimmäiseen neljännekseen.",
    check(r) {
      country("Finland")(r);
      assert.equal(r.workspace.scope.from, "2025-01");
      assert.equal(r.workspace.scope.to, "2025-03");
    },
  },
  { id: "typo", message: "näytä ruotsin toimipistet", check: country("Sweden") },
  {
    id: "dashboard-priority",
    message: "Nosta korjaukset dashboardin tärkeimmäksi graafiksi.",
    check(r) {
      assert.equal(r.workspace.summaryMetric, "repairs");
    },
  },
  {
    id: "hide-water",
    message: "Piilota vesitiedot dashboardista ja poista vesidia PowerPointista.",
    check(r) {
      assert.ok(!r.workspace.visibleInsights.includes("water"));
      assert.ok(!r.workspace.included.includes("water"));
    },
  },
  {
    id: "exact-note",
    message: "Aseta palaverin muistiinpanoksi: Sovitaan seuranta toukokuulle",
    check(r) {
      assert.equal(r.workspace.note, "Sovitaan seuranta toukokuulle");
    },
  },
  {
    id: "slide-title",
    message: "Vaihda ensimmäisen dian otsikoksi: Yhteinen suunta",
    check(r) {
      assert.equal(r.workspace.titleEdits.cover, "Yhteinen suunta");
    },
  },
  {
    id: "slide-swap-with-upsell",
    seed: withApproval,
    message: "Vaihda PowerPointin ensimmäisen ja toisen dian paikkoja.",
    check(r, w) {
      assert.deepEqual(r.workspace.slideOrder.slice(0, 2), ["overview", "cover"]);
      assert.deepEqual(r.workspace.approvedUpsells, w.approvedUpsells);
      const { slides } = buildPresentation(r.workspace);
      const plan = slides.findIndex((slide) => slide.id === "plan");
      assert.ok(slides[plan - 1].id.startsWith("upsell-"));
    },
  },
  {
    id: "customer-switch",
    seed: () =>
      initialWorkspace({
        savings: 40000,
        note: "VAIN NORTHSTAR",
        cooperationDescription: "VAIN NORTHSTAR",
      }),
    message: "Vaihda asiakkaaksi Apex Industrial Systems.",
    check(r) {
      assert.equal(r.workspace.scope.customer, "CUST002");
      assert.equal(r.workspace.savings, null);
      assert.equal(r.workspace.note, "");
      assert.equal(r.workspace.cooperationDescription, "");
    },
  },
  {
    id: "manager-savings",
    message: "Aseta säästöarvioksi 40 000,50 euroa.",
    check(r) {
      assert.equal(r.workspace.savings, 40000.5);
      const deck = buildPresentation(r.workspace);
      assert.ok(deck.slides.find((s) => s.id === "plan").paragraphs.some((p) => p.includes("KAM")));
    },
  },
  {
    id: "clear-savings",
    seed: () => initialWorkspace({ savings: 40000 }),
    message: "Poista KAM:n antama säästöarvio.",
    check(r) {
      assert.equal(r.workspace.savings, null);
    },
  },
  {
    id: "relationship-internal",
    message: "Aseta asiakassuhteen tila keltaiseksi.",
    check(r) {
      assert.equal(r.workspace.cooperation, "yellow");
      assert.ok(buildPresentation(r.workspace).slides.every((s) => !s.cooperation));
    },
  },
  {
    id: "ambiguous",
    message: "Muuta sitä.",
    error: [422],
    check(r, w) {
      unchanged(r, w);
    },
  },
  {
    id: "unsupported-data-edit",
    message: "Muuta lähdeaineiston vedenkulutukseksi 123456789 litraa.",
    error: [422],
    check(r, w) {
      unchanged(r, w);
    },
  },
  {
    id: "year-comparison",
    message: "Vertaa asiakkaan vedenkäyttöä samoihin kuukausiin viime vuonna.",
    check(r, w) {
      assert.equal(r.workspace.view, "analysis");
      assert.equal(r.workspace.scope.from, w.scope.from);
      assert.equal(r.workspace.scope.to, w.scope.to);
    },
  },
  {
    id: "question-preserves-edits",
    seed: () =>
      initialWorkspace({
        note: "KAM:n oma tavoite",
        savings: 40000,
        managerTexts: { plan: "Sovitaan pilotista" },
      }),
    message: "Montako korjausta meillä oli?",
    check(r, w) {
      answer(r);
      unchanged(r, w);
    },
  },
];
