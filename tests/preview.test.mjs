import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

test("preview redirects to the mock and serves every relative asset", async (t) => {
  const child = spawn(process.execPath, ["scripts/preview.mjs"], {
    env: { ...process.env, PORT: "0", PRESENTATION_PROVIDER: "deterministic" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill());
  const origin = await new Promise((resolve, reject) => {
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
  const page = await fetch(origin);
  assert.equal(page.status, 200);
  assert.ok(page.url.endsWith("/kopperoinenp/index.html"));
  const html = await page.text();
  assert.ok(html.includes('new EventSource("/__preview_events")'));
  const assets = [...html.matchAll(/(?:src|href)="([^"#]+\.(?:js|css))"/g)].map((m) => m[1]);
  assert.deepEqual(assets.sort(), [
    "analysis-model.js",
    "app.js",
    "brand.css",
    "data.js",
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
  assert.equal(preview.standard.story, "customer-value-story-v1");
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
