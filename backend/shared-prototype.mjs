import { createPostgresStore } from "./postgres-store.mjs";
import { requestContext } from "./request-context.mjs";
import { fixtureImports } from "./fixture-import.mjs";

function json(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(value));
}
export function sharedPrototype(env = process.env) {
  if (env.REVIEW_STORE !== "postgres") return null;
  if (env.NODE_ENV === "production")
    throw new Error("The selectable-user PostgreSQL prototype cannot run in production.");
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required for the PostgreSQL prototype.");
  const store = createPostgresStore(env.DATABASE_URL);
  async function run(request, response, url, handle) {
    try {
      const expected = `http://${request.headers.host}`;
      if (
        !/^(127\.0\.0\.1|localhost):\d+$/.test(request.headers.host ?? "") ||
        (request.headers.origin && request.headers.origin !== expected)
      )
        return json(response, 403, { error: "Local same-origin requests only." });
      const cookie = request.headers.cookie
        ?.split(";")
        .map((s) => s.trim())
        .find((s) => s.startsWith("demo_user="))
        ?.slice(10);
      const id = cookie ?? "demo-all";
      if (!/^[a-z0-9-]{1,64}$/.test(id))
        return json(response, 403, { error: "Unknown prototype user." });
      const context = await store.context(id);
      const imports = fixtureImports(store, context.user);
      const customerImports = url.pathname.match(
        /^\/api\/v1\/customers\/([A-Za-z0-9_-]{1,64})\/imports$/,
      );
      if (customerImports) {
        if (request.method === "GET")
          return json(response, 200, await imports.list(customerImports[1]));
        if (request.method === "POST") {
          // Only a trusted, repository-owned connector is accepted in phase two. No uploaded paths/SQL.
          if (request.headers["content-length"] && Number(request.headers["content-length"]) > 0)
            return json(response, 400, { error: "The fixture connector takes no request body." });
          const result = await imports.enqueue(customerImports[1]);
          return json(response, result.duplicate ? 200 : 202, result);
        }
        return json(response, 405, { error: "Method not allowed." });
      }
      const job = url.pathname.match(/^\/api\/v1\/jobs\/([0-9a-f-]{36})$/);
      if (job && request.method === "GET") return json(response, 200, await imports.get(job[1]));
      if (url.pathname === "/api/demo/session" && request.method === "GET")
        return json(response, 200, {
          enabled: true,
          user: context.user,
          profiles: await store.users(),
          readOnly: ![...context.permissions.values()].some(Boolean),
          customerCount: context.permissions.size,
        });
      if (url.pathname === "/api/demo/user" && request.method === "POST") {
        if (!request.headers["content-type"]?.startsWith("application/json"))
          return json(response, 415, { error: "Send JSON." });
        let bytes = 0,
          body = "";
        for await (const chunk of request) {
          bytes += chunk.length;
          if (bytes > 1024) return json(response, 413, { error: "Request too large." });
          body += chunk;
        }
        const next = JSON.parse(body).user;
        if (typeof next !== "string")
          return json(response, 400, { error: "Choose a prototype profile." });
        await store.context(next);
        response.setHeader("Set-Cookie", `demo_user=${next}; HttpOnly; SameSite=Strict; Path=/`);
        return json(response, 200, { ok: true });
      }
      return await requestContext.run({ ...context, reviews: store.reviews(context.user) }, () =>
        handle(request, response, url),
      );
    } catch (error) {
      if (!response.headersSent)
        json(response, error.status ?? 503, {
          error: error.status
            ? error.message
            : "The shared database is unavailable. Local files were not used.",
        });
    }
  }
  return { run, close: store.close };
}
