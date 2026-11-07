import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("review settings open beside the customer review, not in Explore data", async () => {
  const page = await readFile(
    new URL("../frontend/mockups/kopperoinenp/index.html", import.meta.url),
    "utf8",
  );
  const editor = page.indexOf('id="review-editor"');
  const settings = page.indexOf('id="review-basics-picker"');
  const explore = page.indexOf('id="analysis-panel"');
  const analysisEnd = page.indexOf('id="analysis-content"');
  assert.ok(editor > analysisEnd && settings > editor, "Settings are outside Explore data");
  assert.ok(explore < analysisEnd);
  assert.match(page, /id="deck"/);
  assert.doesNotMatch(page, /Show customer review/);
});

test("the workspace has one view and folds rarely used settings away", async () => {
  const root = new URL("../frontend/mockups/kopperoinenp/", import.meta.url);
  const page = await readFile(new URL("index.html", root), "utf8");
  const app = await readFile(new URL("app.js", root), "utf8");
  assert.doesNotMatch(app, /\.view-tabs"\)\.hidden = false/);
  assert.match(page, /<nav class="view-tabs"[^>]*hidden/);
  const more = page.indexOf('id="more-settings"');
  for (const id of ["filters", "customer-profile-kpis", "reset-dashboard", "meeting-note"])
    assert.ok(page.indexOf(`id="${id}"`) > more, `${id} is in More settings`);
});

test("the path runs from today's customers through prepare and present", async () => {
  const root = new URL("../frontend/mockups/kopperoinenp/", import.meta.url);
  const page = await readFile(new URL("index.html", root), "utf8");
  const app = await readFile(new URL("app.js", root), "utf8");
  for (const id of ["customer-search", "today-list", "deck", "approve-review", "kam-notes"])
    assert.match(page, new RegExp(`id="${id}"`));
  assert.ok(page.indexOf('id="review-next-steps"') < page.indexOf('id="more-settings"'));
  assert.match(app, /let mode = "home"/);
  assert.match(app, /\$\("#composer"\)\.hidden = !preparing/);
});

test("approval is the main action and teammates' sections stay reachable", async () => {
  const root = new URL("../frontend/mockups/kopperoinenp/", import.meta.url);
  const page = await readFile(new URL("index.html", root), "utf8");
  assert.match(page, /id="approve-review" class="primary"/);
  const editor = page.indexOf('id="review-editor"');
  for (const id of ["upsell-proposals", "relationship-status"])
    assert.ok(page.indexOf(`id="${id}"`) > editor, `${id} is in the panel`);
});
