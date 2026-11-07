import { randomUUID, createHash } from "node:crypto";
import {
  buildPresentation,
  applyPlan,
  defaultPlan,
  PresentationError,
  storyVersion,
} from "./presentation-model.mjs";
import { generatePlan, providerConfig } from "./ai-provider.mjs";
import { renderPowerPoint } from "./powerpoint.mjs";
import { runReviewChat } from "./review-chat.mjs";
import { assessCooperation } from "./cooperation.mjs";
import { templateStandard } from "./lindstrom-template.mjs";
import { createReviewStore } from "./review-store.mjs";
import { dataset } from "./dataset.mjs";
import { analyzeImport } from "./import-analysis.mjs";
import { importFormats, importLimit, readImportFile } from "./import-file.mjs";
import { fileURLToPath } from "node:url";
import { requestContext } from "./request-context.mjs";
import { withPreparedDashboard } from "./prepared-dashboard.mjs";
let reviewStore;
const files = new Map();
const ttl = 10 * 60 * 1000;
let busy = false;
let chatBusy = false;
let importBusy = false;
function json(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(value));
}
function receipt(id, file) {
  return {
    id,
    provider: file.config.provider,
    model: file.config.model,
    ...(file.deck.dashboard ? { dashboard: file.deck.dashboard } : {}),
    slides: file.deck.slides.map(({ id, title }) => ({ id, title })),
    downloadUrl: `/api/presentations/${id}/download`,
    expiresInSeconds: Math.max(1, Math.floor((file.expires - Date.now()) / 1000)),
  };
}
async function readBytes(request, limit) {
  const chunks = [];
  let size = 0;
  if (Number(request.headers["content-length"]) > limit) {
    request.resume();
    throw new PresentationError("The request is too large.", 413);
  }
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > limit) {
      request.resume();
      throw new PresentationError("The request is too large.", 413);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function readJson(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers["content-type"] || ""))
    throw new PresentationError("Send a JSON request.", 415);
  const bytes = await readBytes(request, 32768);
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new PresentationError("Invalid JSON.");
  }
}
// The file goes to the customer, so it carries the customer's name rather than an internal code.
function fileName({ customer, request }) {
  const name = customer.name
    .normalize("NFD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const label = request.language === "fi" ? "asiakaskatsaus" : "customer-review";
  return `${name}-${label}-${request.scope.from}-${request.scope.to}.pptx`;
}
export async function handlePresentationApi(request, response, url) {
  if (!url.pathname.startsWith("/api/")) return false;
  try {
    const context = requestContext.getStore();
    const owner = context ? `${context.user.tenant_id}/${context.user.id}` : "local";
    const assertAccess = (customer, write = false) => {
      if (
        context &&
        (!context.permissions.has(customer) || (write && !context.permissions.get(customer)))
      )
        throw new PresentationError("No access to this customer.", 403);
    };
    const origin = request.headers.origin;
    const host = request.headers.host;
    if (
      !/^(127\.0\.0\.1|localhost):\d+$/.test(host || "") ||
      (origin && origin !== `http://${host}`)
    )
      throw new PresentationError(
        "The presentation service accepts requests from this local application only.",
        403,
      );
    for (const [id, file] of files) if (Date.now() > file.expires) files.delete(id);
    const importMatch = url.pathname.match(/^\/api\/imports\/([A-Za-z0-9_-]+)$/);
    if (importMatch) {
      if (request.method !== "POST") throw new PresentationError("Method not allowed.", 405);
      const [, customer] = importMatch;
      assertAccess(customer, true);
      const selected = dataset?.customers.find((row) => row.customer_id === customer);
      if (!selected) throw new PresentationError("Unknown customer.", 404);
      const format = url.searchParams.get("format");
      if (
        !importFormats.includes(format) ||
        request.headers["content-type"] !== "application/octet-stream"
      )
        throw new PresentationError("Send a CSV, XLSX or JSON file.", 415);
      if (importBusy) throw new PresentationError("Another file is being analyzed.", 429);
      importBusy = true;
      try {
        const bytes = await readBytes(request, importLimit);
        try {
          json(
            response,
            200,
            await analyzeImport(await readImportFile(bytes, format), {
              customer,
              customerName: selected.customer_name,
              otherCustomers: dataset.customers.filter((row) => row !== selected),
              allowSchemaSharing: url.searchParams.get("shareSchema") === "1",
            }),
          );
        } catch (error) {
          throw new PresentationError(error.message || "The file could not be analyzed.");
        }
      } finally {
        importBusy = false;
      }
      return true;
    }
    const reviewMatch = url.pathname.match(/^\/api\/reviews\/([A-Za-z0-9_-]+)$/);
    if (reviewMatch) {
      assertAccess(reviewMatch[1], request.method !== "GET");
      if (!context)
        reviewStore ??= createReviewStore(
          process.env.REVIEW_STORE_DIR ||
            fileURLToPath(new URL("../.local/reviews/", import.meta.url)),
        );
      const activeStore = context?.reviews ?? reviewStore;
      if (request.method === "GET") json(response, 200, await activeStore.read(reviewMatch[1]));
      else if (request.method === "PUT")
        json(response, 200, await activeStore.save(reviewMatch[1], await readJson(request)));
      else throw new PresentationError("Method not allowed.", 405);
      return true;
    }
    if (url.pathname === "/api/presentations/config" && request.method === "GET") {
      json(response, 200, providerConfig());
      return true;
    }
    if (url.pathname === "/api/cooperation" && request.method === "POST") {
      if (context && ![...context.permissions.values()].some(Boolean))
        throw new PresentationError("This prototype profile is read-only.", 403);
      if (chatBusy) throw new PresentationError("Apuri on varattu. Yritä hetken kuluttua.", 429);
      chatBusy = true;
      try {
        json(response, 200, await assessCooperation(await readJson(request)));
      } finally {
        chatBusy = false;
      }
      return true;
    }
    if (url.pathname === "/api/chat" && request.method === "POST") {
      if (context && ![...context.permissions.values()].some(Boolean))
        throw new PresentationError("This prototype profile is read-only.", 403);
      if (chatBusy)
        throw new PresentationError(
          "The assistant is handling another request. Try again shortly.",
          429,
        );
      chatBusy = true;
      try {
        const input = await readJson(request);
        const result = await withPreparedDashboard(
          input?.workspace,
          async () => {
            const reply = await runReviewChat(input);
            const dashboard = requestContext.getStore()?.prepared?.reference;
            return dashboard ? { ...reply, dashboard } : reply;
          },
          { write: true },
        );
        json(response, 200, result);
      } finally {
        chatBusy = false;
      }
      return true;
    }
    const match = url.pathname.match(/^\/api\/presentations\/([a-f0-9-]{36})(\/download)?$/);
    if (match && request.method === "GET") {
      const file = files.get(match[1]);
      if (!file)
        throw new PresentationError("The presentation has expired. Generate it again.", 404);
      if (file.owner !== owner) throw new PresentationError("No access to this presentation.", 403);
      assertAccess(file.deck.request.scope.customer);
      if (!match[2]) {
        json(response, 200, {
          customer: file.deck.customer,
          period: file.deck.period,
          footer: file.deck.footer,
          slides: file.deck.slides,
          ...(file.deck.dashboard ? { dashboard: file.deck.dashboard } : {}),
          downloadUrl: `/api/presentations/${match[1]}/download`,
          standard: { story: storyVersion, template: templateStandard.version },
        });
        return true;
      }
      response.writeHead(200, {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${file.name}"`,
        "Content-Length": file.bytes.length,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(file.bytes);
      return true;
    }
    if (url.pathname === "/api/presentations/preview" && request.method === "POST") {
      const input = await readJson(request);
      const base = await withPreparedDashboard(input, () => buildPresentation(input));
      assertAccess(base.request.scope.customer);
      const deck = applyPlan(base, defaultPlan(base));
      json(response, 200, {
        slides: deck.slides,
        footer: deck.footer,
        ...(deck.dashboard ? { dashboard: deck.dashboard } : {}),
      });
      return true;
    }
    if (url.pathname !== "/api/presentations" || request.method !== "POST")
      throw new PresentationError("Unknown presentation endpoint.", 404);
    if (busy)
      throw new PresentationError("A presentation is being prepared. Try again shortly.", 429);
    busy = true;
    try {
      const input = await readJson(request);
      const base = await withPreparedDashboard(input, () => buildPresentation(input));
      assertAccess(base.request.scope.customer);
      const config = providerConfig();
      const normalized = {
        ...base.request,
        titleEdits: Object.fromEntries(
          Object.entries(base.request.titleEdits).sort(([a], [b]) => a.localeCompare(b)),
        ),
      };
      const requestKey = createHash("sha256")
        .update(
          JSON.stringify({
            request: normalized,
            dashboard: base.dashboard,
            owner,
            locked: input.locked === true,
            provider: config.provider,
            model: config.model,
            story: storyVersion,
            template: templateStandard.version,
          }),
        )
        .digest("hex");
      const cached = [...files.entries()].find(
        ([, file]) => file.requestKey === requestKey && file.expires > Date.now(),
      );
      if (cached) {
        json(response, 200, receipt(cached[0], cached[1]));
        return true;
      }

      const plan =
        config.provider === "deterministic" || input.locked === true
          ? defaultPlan(base)
          : await generatePlan(base);
      const deck = applyPlan(base, plan);
      const bytes = await renderPowerPoint(deck);
      if (bytes.length > 5 * 1024 * 1024)
        throw new PresentationError("The presentation exceeds the file size limit.", 500);
      const id = randomUUID();
      if (files.size >= 8) files.delete(files.keys().next().value);
      files.set(id, {
        owner,
        bytes,
        deck,
        config,
        requestKey,
        expires: Date.now() + ttl,
        name: fileName(base),
      });
      json(response, 201, receipt(id, files.get(id)));
    } finally {
      busy = false;
    }
  } catch (error) {
    const message =
      error instanceof PresentationError
        ? error.message
        : url.pathname === "/api/chat"
          ? "Could not process the assistant request."
          : "Could not create the PowerPoint.";
    json(response, error instanceof PresentationError ? error.status : 500, {
      error: globalThis.ReviewLanguage.translate(url.searchParams.get("lang"), message),
    });
  }
  return true;
}
