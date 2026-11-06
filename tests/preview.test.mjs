import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

test("preview redirects to the mock and serves every relative asset", async (t) => {
  const child = spawn(process.execPath, ["scripts/preview.mjs"], {
    env: { ...process.env, PORT: "0" },
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
  assert.ok(page.url.endsWith("/kopperoinenp-v1/index.html"));
  const html = await page.text();
  const assets = [...html.matchAll(/(?:src|href)="([^"#]+\.(?:js|css))"/g)].map((m) => m[1]);
  assert.deepEqual(assets.sort(), ["app.js", "data.js", "model.js", "styles.css"]);
  for (const asset of assets) {
    const response = await fetch(new URL(asset, page.url));
    assert.equal(response.status, 200, `${asset} should be served`);
    assert.ok((await response.text()).length > 0);
  }
  const escape = await fetch(`${origin}/%2e%2e%2fpackage.json`);
  assert.equal(escape.status, 404);
});
