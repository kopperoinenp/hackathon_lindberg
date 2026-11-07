// Loopback-only workspace and presentation API. Provider secrets stay server-side.
import { createServer } from "node:http";
import { watch, existsSync } from "node:fs";
import { readFile, stat, realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const envFile = fileURLToPath(new URL("../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
const { sharedPrototype } = await import("../backend/shared-prototype.mjs");
const { datasetSource } = await import("../backend/dataset.mjs");
const { handlePresentationApi } = await import("../backend/presentation-api.mjs");

const root = fileURLToPath(new URL("../frontend/mockups/", import.meta.url));
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".md": "text/plain; charset=utf-8",
};
const port = Number(process.env.PORT || 4173);
const shared = sharedPrototype();
const dataPath = path.join(root, "kopperoinenp", "data.js");
const samePath = (a, b) =>
  process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
const datasetPath = (url) =>
  samePath(path.resolve(root, `.${decodeURIComponent(url.pathname)}`), dataPath);
const clients = new Set();
let reloadTimer;
watch(root, { recursive: true }, (_event, filename) => {
  if (
    !filename ||
    ![".html", ".js", ".css", ".webp", ".woff2"].includes(path.extname(String(filename)))
  )
    return;
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    for (const client of clients) client.write("data: reload\n\n");
  }, 350);
});
async function handleRequest(request, response, url) {
  try {
    if (!shared && url.pathname === "/api/demo/session") {
      response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ enabled: false }));
      return;
    }
    if (await handlePresentationApi(request, response, url)) return;
    if (url.pathname === "/__preview_events") {
      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      response.write(": connected\n\n");
      clients.add(response);
      request.on("close", () => clients.delete(response));
      return;
    }
    if (["/", "/kopperoinenp-v2/", "/kopperoinenp-v2/index.html"].includes(url.pathname)) {
      response.writeHead(302, { Location: "/kopperoinenp/index.html" });
      response.end();
      return;
    }
    if (datasetPath(url)) {
      if (shared) {
        response.writeHead(410, { "Content-Type": "text/plain", "Cache-Control": "no-store" });
        response.end("Raw browser datasets are disabled. Use the versioned dashboard API.");
        return;
      }
      const source = datasetSource;
      response.writeHead(source ? 200 : 503, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(source);
      return;
    }
    const pathname = decodeURIComponent(
      url.pathname === "/" ? "/kopperoinenp/index.html" : url.pathname,
    );
    const file = path.resolve(root, `.${pathname}`);
    const relative = path.relative(root, file);
    if (relative.startsWith("..") || path.isAbsolute(relative) || !(await stat(file)).isFile()) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    if (pathname.includes(":") || !Object.hasOwn(mime, path.extname(file).toLowerCase())) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    // Reject filesystem aliases which bypass the canonical data route (including Windows aliases).
    if (shared && samePath(await realpath(file), await realpath(dataPath))) {
      response.writeHead(403);
      response.end("Use the scoped dataset route");
      return;
    }
    let content = await readFile(file);
    if (path.extname(file) === ".html")
      content = content
        .toString()
        .replace(
          "</body>",
          '<script>const previewEvents=new EventSource("/__preview_events");previewEvents.onmessage=()=>location.reload();</script></body>',
        );
    response.writeHead(200, {
      "Content-Type": mime[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(content);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1");
    const isData = datasetPath(url);
    if (shared && (url.pathname.startsWith("/api/") || isData))
      await shared.run(request, response, url, handleRequest);
    else await handleRequest(request, response, url);
  } catch {
    if (!response.headersSent) response.writeHead(400);
    response.end("Invalid request");
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(`Local: http://127.0.0.1:${server.address().port}`),
);
