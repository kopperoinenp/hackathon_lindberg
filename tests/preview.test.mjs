import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, unlink, rmdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path, { join } from "node:path";
import { once } from "node:events";

async function startPreview(t, dataset = "") {
  const reviewDirectory = await mkdtemp(path.join(tmpdir(), "kam-http-review-"));
  const child = spawn(process.execPath, ["scripts/preview.mjs"], {
    env: {
      ...process.env,
      PORT: "0",
      PRESENTATION_PROVIDER: "deterministic",
      REVIEW_DATASET: dataset,
      REVIEW_STORE_DIR: reviewDirectory,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill();
      await exited;
    }
    assert.equal(path.dirname(path.resolve(reviewDirectory)), path.resolve(tmpdir()));
    assert.ok(path.basename(reviewDirectory).startsWith("kam-http-review-"));
    await rm(reviewDirectory, { recursive: true, force: true });
  });
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => reject(new Error("Preview did not start")), 5000);
    child.on("error", reject);
    child.on("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Preview exited early: ${code}`));
    });
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const match = output.match(/Local: (http:\/\/127\.0\.0\.1:\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
  });
}

test("invalid active data leaves the preview available and blocks analysis", async (t) => {
  const folder = await mkdtemp(join(tmpdir(), "lindberg-invalid-dataset-"));
  const candidate = join(folder, "candidate.json");
  await writeFile(candidate, '{"source":"Candidate","year":"2025","status":"SYNTHETIC"}');
  t.after(async () => {
    await unlink(candidate);
    await rmdir(folder);
  });
  const origin = await startPreview(t, candidate);
  const page = await fetch(origin);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /id="dataset-status"/);
  for (const [endpoint, body] of [
    ["presentations", {}],
    ["chat", { message: "Show results", workspace: { scope: {} } }],
  ]) {
    const response = await fetch(origin + "/api/" + endpoint + "?lang=fi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /yhteensopivaa aineistoa/);
  }
});

test("preview redirects to the mock and serves every relative asset", async (t) => {
  const origin = await startPreview(t);
  const initialReview = await (await fetch(`${origin}/api/reviews/CUST001`)).json();
  assert.equal(initialReview.revision, 0);
  const put = await fetch(`${origin}/api/reviews/CUST001`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      revision: 0,
      workspace: {
        scope: { customer: "CUST001" },
        savings: 40000,
        dashboardLayout: { sections: ["savings", "metrics"], metrics: ["allocated"] },
      },
    }),
  });
  assert.equal(put.status, 200);
  const restored = await (await fetch(`${origin}/api/reviews/CUST001`)).json();
  assert.equal(restored.workspace.savings, 40000);
  assert.deepEqual(restored.workspace.dashboardLayout.sections, ["savings", "metrics"]);
  const conflict = await fetch(`${origin}/api/reviews/CUST001`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ revision: 0, workspace: { scope: { customer: "CUST001" } } }),
  });
  assert.equal(conflict.status, 409);
  assert.equal((await (await fetch(`${origin}/api/reviews/CUST002`)).json()).workspace, null);
  const page = await fetch(origin);
  const emptyAssessment = await fetch(`${origin}/api/cooperation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description: "" }),
  });
  assert.equal(emptyAssessment.status, 400);
  const foreignAssessment = await fetch(`${origin}/api/cooperation`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://example.org" },
    body: JSON.stringify({ description: "Test" }),
  });
  assert.equal(foreignAssessment.status, 403);
  assert.equal(page.status, 200);
  assert.ok(page.url.endsWith("/kopperoinenp/index.html"));
  const html = await page.text();
  assert.ok(html.includes('new EventSource("/__preview_events")'));
  const assets = [...html.matchAll(/(?:src|href)="([^"#]+\.(?:js|css))"/g)].map((m) => m[1]);
  assert.deepEqual(assets.sort(), [
    "analysis-model.js",
    "app.js",
    "brand.css",
    "dataset.js",
    "language.js",
    "meeting-model.js",
    "model.js",
    "story-model.js",
    "styles.css",
    "summary-charts.js",
  ]);
  for (const asset of assets) {
    const response = await fetch(new URL(asset, page.url));
    assert.equal(response.status, 200, `${asset} should be served`);
    assert.ok((await response.text()).length > 0);
  }
  const dataset = await fetch(new URL("data.js", page.url));
  assert.equal(dataset.status, 200);
  assert.match(dataset.headers.get("content-type"), /^text\/plain/);
  assert.match(await dataset.text(), /globalThis\.REVIEW_DATA = \{/);
  const font = await fetch(new URL("assets/libre-franklin.woff2", page.url));
  assert.equal(font.status, 200);
  assert.equal(font.headers.get("content-type"), "font/woff2");
  assert.equal(
    new TextDecoder().decode(new Uint8Array(await font.arrayBuffer()).slice(0, 4)),
    "wOF2",
  );
  const logo = await fetch(new URL("assets/lindstrom-logo.webp", page.url));
  assert.equal(logo.status, 200);
  assert.equal(logo.headers.get("content-type"), "image/webp");
  const escape = await fetch(`${origin}/%2e%2e%2fpackage.json`);
  assert.equal(escape.status, 404);
  for (const old of ["kopperoinenp-v1", "kopperoinenp-v2"]) {
    assert.equal((await fetch(`${origin}/${old}/index.html`)).status, 404);
  }
  const config = await (await fetch(`${origin}/api/presentations/config`)).json();
  assert.equal(config.provider, "deterministic");
  assert.ok(!Object.hasOwn(config, "OPENAI_API_KEY"));
  const denied = await fetch(`${origin}/api/presentations`, {
    method: "POST",
    headers: { Origin: "https://untrusted.example", "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(denied.status, 403);
  const oversized = await fetch(`${origin}/api/presentations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note: "x".repeat(34000) }),
  });
  assert.equal(oversized.status, 413);
  const invalid = await fetch(`${origin}/api/presentations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ included: [] }),
  });
  assert.equal(invalid.status, 400);
  const chatUnavailable = await fetch(`${origin}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspace: { scope: {} }, message: "Painota vettä" }),
  });
  assert.equal(chatUnavailable.status, 503);
  const chatDenied = await fetch(`${origin}/api/chat`, {
    method: "POST",
    headers: { Origin: "https://untrusted.example", "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(chatDenied.status, 403);
  const chatInvalid = await fetch(`${origin}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  assert.equal(chatInvalid.status, 400);
  const created = await fetch(`${origin}/api/presentations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope: { customer: "CUST003" }, included: ["repairs"] }),
  });
  assert.equal(created.status, 201);
  const presentation = await created.json();
  assert.deepEqual(
    presentation.slides.map((slide) => slide.id),
    ["cover", "overview", "repairs", "plan", "sources", "limits"],
  );
  const reorderedResponse = await fetch(`${origin}/api/presentations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scope: { customer: "CUST003" },
      included: ["repairs"],
      slideOrder: ["overview", "cover"],
    }),
  });
  assert.equal(reorderedResponse.status, 201);
  const reordered = await reorderedResponse.json();
  assert.deepEqual(
    reordered.slides.slice(0, 2).map((s) => s.id),
    ["overview", "cover"],
  );
  const reorderedViewer = await (await fetch(`${origin}/api/presentations/${reordered.id}`)).json();
  assert.deepEqual(
    reorderedViewer.slides.slice(0, 2).map((s) => s.id),
    ["overview", "cover"],
  );
  const { default: JSZip } = await import("jszip");
  const native = await JSZip.loadAsync(
    await (await fetch(`${origin}${reordered.downloadUrl}`)).arrayBuffer(),
  );
  assert.match(await native.file("ppt/slides/slide1.xml").async("string"), /Service use and care/);
  assert.match(await native.file("ppt/slides/slide2.xml").async("string"), /Mediora/);
  const finnish = await fetch(`${origin}/api/presentations?lang=fi`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ language: "fi", scope: { customer: "CUST003" }, included: ["repairs"] }),
  });
  assert.equal(finnish.status, 201);
  const localized = await finnish.json();
  assert.notEqual(localized.id, presentation.id);
  assert.equal(localized.slides[1].title, "Palvelun käyttö ja huolto yhdellä silmäyksellä");
  const fiBytes = await (await fetch(`${origin}${localized.downloadUrl}`)).arrayBuffer();
  const fiDeck = await JSZip.loadAsync(fiBytes);
  assert.match(
    await fiDeck.file("ppt/slides/slide2.xml").async("string"),
    /Palvelun käyttö ja huolto/,
  );
  const reused = await fetch(`${origin}/api/presentations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope: { customer: "CUST003" }, included: ["repairs"] }),
  });
  assert.equal(reused.status, 200);
  assert.equal((await reused.json()).id, presentation.id);
  const viewer = await fetch(`${origin}/kopperoinenp/presentation.html?id=${presentation.id}`);
  assert.equal(viewer.status, 200);
  assert.match(await viewer.text(), /presentation-viewer.js/);
  const preview = await (await fetch(`${origin}/api/presentations/${presentation.id}`)).json();
  assert.deepEqual(
    preview.slides.map((slide) => slide.id),
    presentation.slides.map((slide) => slide.id),
  );
  assert.equal(preview.standard.story, "customer-value-story-v2");
  assert.equal(preview.standard.template, "lindstrom-reference-2026-11-06-v1");
  const download = await fetch(`${origin}${presentation.downloadUrl}`);
  assert.equal(download.status, 200);
  assert.match(download.headers.get("content-type"), /presentationml/);
  assert.match(download.headers.get("content-disposition"), /CUST003/);
  assert.ok((await download.arrayBuffer()).byteLength > 10000);
  const stream = await fetch(`${origin}/__preview_events`);
  assert.match(stream.headers.get("content-type"), /text\/event-stream/);
  const reader = stream.body.getReader();
  const initial = await reader.read();
  assert.match(new TextDecoder().decode(initial.value), /connected/);
  await reader.cancel();
});
