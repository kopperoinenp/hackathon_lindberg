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
import { templateStandard } from "./lindstrom-template.mjs";
const files = new Map();
const ttl = 10 * 60 * 1000;
let busy = false;
let chatBusy = false;
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
    slides: file.deck.slides.map(({ id, title }) => ({ id, title })),
    downloadUrl: `/api/presentations/${id}/download`,
    expiresInSeconds: Math.max(1, Math.floor((file.expires - Date.now()) / 1000)),
  };
}
async function readJson(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers["content-type"] || ""))
    throw new PresentationError("Käytä JSON-pyyntöä.", 415);
  const chunks = [];
  let size = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > 32768) {
      request.resume();
      throw new PresentationError("Esityspyyntö on liian suuri.", 413);
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new PresentationError("Virheellinen JSON.");
  }
}
export async function handlePresentationApi(request, response, url) {
  if (!url.pathname.startsWith("/api/")) return false;
  try {
    const origin = request.headers.origin;
    const host = request.headers.host;
    if (
      !/^(127\.0\.0\.1|localhost):\d+$/.test(host || "") ||
      (origin && origin !== `http://${host}`)
    )
      throw new PresentationError(
        "Esityspalvelu hyväksyy vain saman paikallisen sovelluksen pyynnöt.",
        403,
      );
    for (const [id, file] of files) if (Date.now() > file.expires) files.delete(id);
    if (url.pathname === "/api/presentations/config" && request.method === "GET") {
      json(response, 200, providerConfig());
      return true;
    }
    if (url.pathname === "/api/chat" && request.method === "POST") {
      if (chatBusy)
        throw new PresentationError(
          "Apuri käsittelee edellistä viestiä. Yritä hetken kuluttua.",
          429,
        );
      chatBusy = true;
      try {
        json(response, 200, await runReviewChat(await readJson(request)));
      } finally {
        chatBusy = false;
      }
      return true;
    }
    const match = url.pathname.match(/^\/api\/presentations\/([a-f0-9-]{36})(\/download)?$/);
    if (match && request.method === "GET") {
      const file = files.get(match[1]);
      if (!file)
        throw new PresentationError("Esitys on vanhentunut. Luo PowerPoint uudelleen.", 404);
      if (!match[2]) {
        json(response, 200, {
          customer: file.deck.customer,
          period: file.deck.period,
          footer: file.deck.footer,
          slides: file.deck.slides,
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
    if (url.pathname !== "/api/presentations" || request.method !== "POST")
      throw new PresentationError("Tuntematon esitysrajapinta.", 404);
    if (busy)
      throw new PresentationError("Esitystä muodostetaan parhaillaan. Yritä hetken kuluttua.", 429);
    busy = true;
    try {
      const base = buildPresentation(await readJson(request));
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
        config.provider === "deterministic" ? defaultPlan(base) : await generatePlan(base);
      const deck = applyPlan(base, plan);
      const bytes = await renderPowerPoint(deck, config);
      if (bytes.length > 5 * 1024 * 1024)
        throw new PresentationError("Esitystiedosto ylitti sallitun koon.", 500);
      const id = randomUUID();
      if (files.size >= 8) files.delete(files.keys().next().value);
      files.set(id, {
        bytes,
        deck,
        config,
        requestKey,
        expires: Date.now() + ttl,
        name: `${base.request.scope.customer}-asiakaskatsaus-${base.request.scope.from}-${base.request.scope.to}.pptx`,
      });
      json(response, 201, receipt(id, files.get(id)));
    } finally {
      busy = false;
    }
  } catch (error) {
    json(response, error instanceof PresentationError ? error.status : 500, {
      error:
        error instanceof PresentationError
          ? error.message
          : url.pathname === "/api/chat"
            ? "Apurin pyynnön käsittely epäonnistui."
            : "PowerPointin muodostaminen epäonnistui.",
    });
  }
  return true;
}
