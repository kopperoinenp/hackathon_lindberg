// Loopback-only static preview. No uploads, backend or dependency required.
import { createServer } from "node:http";
import { watch } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

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
const clients = new Set();
let reloadTimer;
watch(root, { recursive: true }, () => {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    for (const client of clients) client.write("data: reload\n\n");
  }, 350);
});
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1");
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
    if (url.pathname === "/") {
      response.writeHead(302, { Location: "/kopperoinenp/index.html" });
      response.end();
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
});
server.listen(port, "127.0.0.1", () =>
  console.log(`Local: http://127.0.0.1:${server.address().port}`),
);
