import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createReviewStore } from "../backend/review-store.mjs";
const workspace = (customer = "CUST001") => ({
  scope: { customer },
  savings: 40000,
  heading: "KAM view",
  note: "Follow up",
  cooperation: "yellow",
  cooperationDescription: "Delivery concerns under review",
  cooperationReason: "KAM follow-up needed",
  dashboardLayout: { sections: ["savings", "metrics"], metrics: ["allocated"] },
  managerTexts: { plan: "Meet next month" },
  contractKpis: [
    {
      label: "Delivery",
      area: "performance",
      actual: "97 %",
      target: "99 %",
      source: "Q4 report",
      priority: true,
    },
  ],
  includeContractAgenda: true,
});
test("customer reviews persist across store restart, retain dashboard edits, and remain customer-specific", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "kam-review-"));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(tmpdir()));
    assert.ok(path.basename(dir).startsWith("kam-review-"));
    return rm(dir, { recursive: true, force: true });
  });
  const store = createReviewStore(dir);
  assert.equal((await store.read("CUST001")).revision, 0);
  assert.equal((await store.read("CUST002")).workspace, null);
  assert.deepEqual(await readdir(dir), [], "Browsing customers must not create saved reviews");
  const saved = await store.save("CUST001", { revision: 0, workspace: workspace() });
  assert.deepEqual(await readdir(dir), ["CUST001.json"], "Only the created customer review exists");
  assert.equal(saved.revision, 1);
  const restarted = createReviewStore(dir);
  const loaded = await restarted.read("CUST001");
  assert.deepEqual(loaded, saved);
  assert.equal(loaded.workspace.savings, 40000);
  assert.equal(loaded.workspace.cooperationDescription, workspace().cooperationDescription);
  assert.equal(loaded.workspace.cooperationReason, workspace().cooperationReason);
  assert.deepEqual(loaded.workspace.contractKpis, workspace().contractKpis);
  assert.equal(loaded.workspace.includeContractAgenda, true);
  assert.deepEqual(loaded.workspace.dashboardLayout.sections, ["savings", "metrics"]);
  assert.equal((await restarted.read("CUST002")).workspace, null);
  await restarted.save("CUST002", { revision: 0, workspace: workspace("CUST002") });
  assert.deepEqual(await restarted.read("CUST001"), saved);
});
test("stale or simultaneous writes cannot overwrite newer edits; invalid data and broken files are preserved", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "kam-review-"));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(tmpdir()));
    assert.ok(path.basename(dir).startsWith("kam-review-"));
    return rm(dir, { recursive: true, force: true });
  });
  const store = createReviewStore(dir);
  const results = await Promise.allSettled([
    store.save("CUST001", { revision: 0, workspace: workspace() }),
    store.save("CUST001", { revision: 0, workspace: { ...workspace(), savings: 9 } }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.find((r) => r.status === "rejected").reason.status, 409);
  await assert.rejects(store.save("CUST001", { revision: 1, workspace: workspace("CUST002") }));
  await assert.rejects(
    store.save("CUST001", { revision: 1, workspace: { ...workspace(), savings: -1 } }),
  );
  await assert.rejects(store.read("../bad"), (e) => e.status === 404);
  assert.equal((await store.read("CUST001")).workspace.savings, 40000);
  await writeFile(path.join(dir, "CUST001.json"), "broken");
  await assert.rejects(
    store.save("CUST001", { revision: 1, workspace: workspace() }),
    (e) => e.status === 500,
  );
});

test("the first edit creates one customer review and later edits update it", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "kam-review-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = createReviewStore(dir);
  assert.equal((await store.read("CUST002")).workspace, null);
  const first = await store.save("CUST002", {
    revision: 0,
    workspace: {
      ...workspace("CUST002"),
      evidenceAreas: ["performance"],
      customerBasics: [],
      nextSteps: [{ title: "Review deliveries", owner: "KAM", due: "Q2" }],
    },
  });
  assert.equal(first.revision, 1);
  const edited = { ...first.workspace, heading: "Water focus" };
  await store.save("CUST002", { revision: first.revision, workspace: edited });
  const reopened = await createReviewStore(dir).read("CUST002");
  assert.equal(reopened.revision, 2);
  assert.equal(reopened.workspace.heading, "Water focus");
  assert.deepEqual(reopened.workspace.evidenceAreas, ["performance"]);
  assert.deepEqual(reopened.workspace.customerBasics, []);
  assert.equal(reopened.workspace.nextSteps[0].title, "Review deliveries");
});

test("the workspace has no mode that keeps the assistant from editing", async () => {
  const root = new URL("../frontend/mockups/kopperoinenp/", import.meta.url);
  const page = await readFile(new URL("index.html", root), "utf8");
  const app = await readFile(new URL("app.js", root), "utf8");
  assert.doesNotMatch(page, /review-profile-mode|create-customer-review/);
  assert.doesNotMatch(app, /profileMode/);
  assert.doesNotMatch(app, /flushReviewSave\(true\)/);
  assert.equal(page.match(/id="query-result"/g).length, 1);
});
