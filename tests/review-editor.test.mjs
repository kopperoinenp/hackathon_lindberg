import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("review settings open beside the customer review", async () => {
  const page = await readFile(
    new URL("../frontend/mockups/kopperoinenp/index.html", import.meta.url),
    "utf8",
  );
  const editor = page.indexOf('id="review-editor"');
  const settings = page.indexOf('id="review-basics-picker"');
  const explore = page.indexOf('id="analysis-panel"');
  const analysisEnd = page.indexOf('id="analysis-content"');
  assert.ok(editor > analysisEnd && settings > editor, "Settings are in the review panel");
  assert.ok(explore < analysisEnd);
  assert.match(page, /id="deck"/);
  assert.doesNotMatch(page, /Show customer review/);
});

test("the workspace is one page and folds rarely used settings away", async () => {
  const root = new URL("../frontend/mockups/kopperoinenp/", import.meta.url);
  const page = await readFile(new URL("index.html", root), "utf8");
  const app = await readFile(new URL("app.js", root), "utf8");
  assert.doesNotMatch(app, /view-tabs/);
  assert.doesNotMatch(page, /view-tabs/);
  const more = page.indexOf('id="more-settings"');
  for (const id of ["filters", "reset-dashboard"])
    assert.ok(page.indexOf(`id="${id}"`) > more, `${id} is in More settings`);
});

test("the path runs from today's customers through prepare and present", async () => {
  const root = new URL("../frontend/mockups/kopperoinenp/", import.meta.url);
  const page = await readFile(new URL("index.html", root), "utf8");
  const app = await readFile(new URL("app.js", root), "utf8");
  for (const id of ["customer-search", "today-list", "deck", "download-powerpoint"])
    assert.match(page, new RegExp(`id="${id}"`));
  for (const id of [
    "kam-notes",
    "meeting-note",
    "review-next-steps",
    "copy-summary",
    "review-area-gaps",
  ])
    assert.doesNotMatch(page, new RegExp(`id="${id}"`));
  assert.match(app, /let mode = "home"/);
  assert.match(app, /\$\("#composer"\)\.hidden = !preparing/);
});

test("approval is the main action and teammates' sections stay reachable", async () => {
  const root = new URL("../frontend/mockups/kopperoinenp/", import.meta.url);
  const page = await readFile(new URL("index.html", root), "utf8");
  assert.match(page, /id="download-powerpoint" class="primary"/);
  assert.doesNotMatch(page, /approve-review|back-today|customer-profile-kpis|relationship-status/);
  const editor = page.indexOf('id="review-editor"');
  for (const id of ["upsell-proposals", "review-basics-picker"])
    assert.ok(page.indexOf(`id="${id}"`) > editor, `${id} is in the panel`);
});
