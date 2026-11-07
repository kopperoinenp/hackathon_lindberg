import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { dataset, fixtureDataset } from "../backend/dataset.mjs";
import {
  buildPresentation,
  applyPlan,
  defaultPlan,
  validateRequest,
} from "../backend/presentation-model.mjs";
import { renderPowerPoint } from "../backend/powerpoint.mjs";
import { createReviewStore } from "../backend/review-store.mjs";
import { chatSchema, normalizeWorkspace, runReviewChat } from "../backend/review-chat.mjs";
const model = globalThis.UpsellModel;
const scope = {
  customer: "CUST002",
  from: "2025-01",
  to: "2025-12",
  country: "all",
  continent: "all",
  site: "all",
};
const proposals = (s = scope, language = "en") => model.proposals(dataset, s, language);
const approval = (p) => ({ id: p.id, evidenceKey: p.evidenceKey });

test("opportunities contain customer-specific evidence and do not invent services or savings", () => {
  const list = proposals();
  assert.ok(list.length >= 2);
  const repair = list.find((p) => p.id.endsWith(":repair"));
  const metrics = globalThis.WorkspaceModel.summarize(
    globalThis.WorkspaceModel.select(dataset, scope),
  );
  assert.ok(repair.observation.includes(new Intl.NumberFormat("en-GB").format(metrics.repairs)));
  assert.ok(list.some((p) => p.id.endsWith(":wipers")));
  assert.ok(!proposals({ ...scope, customer: "CUST001" }).some((p) => p.id.endsWith(":wipers")));
  for (const p of list) {
    assert.ok(p.source.includes(dataset.source));
    assert.ok(p.boundary.includes("existing contract"));
    assert.ok(p.sites.includes("Apex"));
    assert.ok(!p.benefit.includes("€"));
  }
  assert.deepEqual(proposals({ ...scope, from: "2026-01", to: "2026-12" }), []);
});

test("approval survives language changes but scope or changed evidence requires reapproval", () => {
  const selected = proposals().map(approval);
  assert.equal(model.approved(proposals(scope, "fi"), selected).length, selected.length);
  assert.equal(model.approved(proposals({ ...scope, to: "2025-06" }), selected).length, 0);
  const modified = structuredClone(fixtureDataset);
  modified.records
    .filter((r) => r.customer === scope.customer)
    .forEach((r) => {
      r.repair_count += 1;
    });
  assert.equal(
    model
      .approved(model.proposals(modified, scope), selected)
      .some((p) => p.id.endsWith(":repair")),
    false,
  );
  assert.throws(() =>
    validateRequest({ scope: { customer: "CUST001" }, approvedUpsells: selected }),
  );
  assert.throws(() =>
    validateRequest({ scope, approvedUpsells: [{ ...selected[0], title: "Invented" }] }),
  );
  assert.throws(() => validateRequest({ scope, approvedUpsells: [selected[0], selected[0]] }));
});

test("only approved current proposals reach final slides and the actual PowerPoint", async () => {
  const p = proposals().find((row) => row.id.endsWith(":wipers"));
  const base = buildPresentation({ scope, approvedUpsells: [approval(p)] });
  const deck = applyPlan(base, defaultPlan(base));
  assert.equal(deck.slides.at(-1).title, p.title);
  assert.equal(deck.slides.filter((slide) => slide.id.startsWith("upsell-")).length, 1);
  const plain = buildPresentation({ scope });
  assert.equal(
    plain.slides.some((slide) => slide.id.startsWith("upsell-")),
    false,
  );
  const stale = buildPresentation({
    scope: { ...scope, to: "2025-06" },
    approvedUpsells: [approval(p)],
  });
  assert.equal(
    stale.slides.some((slide) => slide.id.startsWith("upsell-")),
    false,
  );
  const bytes = await renderPowerPoint(deck, { provider: "deterministic" });
  const zip = await JSZip.loadAsync(bytes);
  const final = await zip.file(`ppt/slides/slide${deck.slides.length}.xml`).async("string");
  assert.ok(final.includes(p.title));
  assert.ok(final.includes("Benefits have not been verified"));
});

test("chat can reorder review slides while approved opportunities stay at the end", async () => {
  const selected = approval(proposals()[0]);
  const workspace = normalizeWorkspace({
    scope,
    approvedUpsells: [selected],
    cooperationDescription: "Internal relationship description",
    cooperationReason: "Internal relationship rationale",
  });
  const before = buildPresentation(workspace).slides;
  const result = await runReviewChat(
    { workspace, message: "Swap slides 1 and 2" },
    {
      generate: async ({ input }) => {
        const context = JSON.parse(input);
        assert.equal(context.presentationSlides.length, before.length - 1);
        assert.equal(context.workspace.cooperationDescription, undefined);
        assert.equal(context.workspace.cooperationReason, undefined);
        return {
          ...Object.fromEntries(chatSchema.required.map((key) => [key, null])),
          scope: Object.fromEntries(chatSchema.properties.scope.required.map((key) => [key, null])),
          supported: true,
          slideSwap: { first: 1, second: 2 },
        };
      },
    },
  );
  const after = buildPresentation(result.workspace).slides;
  assert.deepEqual(
    after.map(({ id }) => id),
    [before[1], before[0], ...before.slice(2)].map(({ id }) => id),
  );
  assert.equal(result.workspace.cooperationDescription, workspace.cooperationDescription);
  assert.equal(result.workspace.cooperationReason, workspace.cooperationReason);
});

test("approvals persist per customer across restart and legacy reviews default to none", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "kam-upsell-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const selected = proposals().slice(0, 1).map(approval);
  await createReviewStore(dir).save(scope.customer, {
    revision: 0,
    workspace: { scope, approvedUpsells: selected },
  });
  const restarted = createReviewStore(dir);
  assert.deepEqual((await restarted.read(scope.customer)).workspace.approvedUpsells, selected);
  assert.equal((await restarted.read("CUST001")).workspace, null);
  assert.deepEqual(normalizeWorkspace({ scope }).approvedUpsells, []);
});
