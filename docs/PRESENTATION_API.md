# Presentation API v1 — local development

Owner: Paulus Kopperoinen. Scope authorized by the user on 2026-11-07: retain the
UI baseline, add genuine PowerPoint creation using OpenAI first, and allow later
Copilot use. This is a new internal contract; it replaces no existing endpoints.
Frontend and backend are implemented together in the same PR.

## Flow and boundaries

Browser scope and content selections → same-origin Node HTTP API → validate scope
→ recalculate from the tracked synthetic fixture → model chooses an insight order
and approved headline variants → validate model output → deterministic PPTX writer.
The model never runs calculations, calls tools, invents numerical results or
writes arbitrary client claims. Selected insights are retained; sources and
limitations are mandatory. Explicit manager headline edits take precedence.

Both providers implement `generatePlan(deck) -> { order, headlines }`:

- `order`: a permutation of selected evidence IDs: water, emissions, repairs.
  Opportunity is a fixed future chapter after the evidence. Duplicates, missing IDs and unknown IDs are rejected.
- `headlines`: one `{id, choice}` per selected insight. Choice is 0 or 1 from the
  supplied deterministic headline options. Model output cannot change evidence.

OpenAI uses the Responses API with strict JSON Schema and `store:false`. Copilot
uses Microsoft Graph beta conversations/chat and the same locally validated plan.
These are different external APIs; their wire protocols and authentication are
not interchangeable. The common contract is internal to this application.

## GET /api/presentations/config

Returns `{provider, model, configured}`. No credentials are returned.

## POST /api/presentations

JSON request: `{scope, included, titleEdits, note}`.

`scope` fields: customer, from, to, country, continent, site, baseline, priority.
Defaults are CUST001, 2025-01, 2025-12, all, all, all, B_LOCAL, neutral.
Only known customers/sites, Finland/Sweden/Poland, Europe, 2025 months and known
baselines/priorities are accepted. A site must belong to its customer.
`included`: 1–4 distinct known insight IDs. `titleEdits`: known slide IDs to text,
max 150 characters each. `note`: plain text, max 2000 characters. Body max 32 KiB.

201 JSON (200 when the same completed request is reused): `{id, provider, model, slides:[{id,title}], downloadUrl,
expiresInSeconds:600}`. The UI opens the finished presentation in a new browser tab. The viewer loads
its validated content from `GET /api/presentations/{id}`. It invalidates the download link when scope/content changes. A response
for a changed request is not applied. Native charts/figures stay deterministic.

## GET /api/presentations/{id}

Returns `{customer, period, footer, slides, downloadUrl, standard}` for browser
viewing. `standard` carries the story/template versions. This is the same deck
object passed to the native PPTX renderer; provider credentials are absent.

## GET /api/presentations/{id}/download

Returns the genuine OOXML `.pptx` with an attachment filename and correct MIME
type. Slides include editable native text/charts with embedded chart workbooks,
source references, synthetic-data labels and presenter notes with provenance.
Downloads remain in server memory for 10 minutes; at most 8 files of at most 5 MiB
are retained. Restarting the service removes them.

## Errors and operational limits

JSON `{error: "Finnish user-facing explanation"}`. 400 invalid scope/content,
403 cross-origin/invalid host, 404 absent/expired download, 413 too large,
415 non-JSON request, 429 another generation in progress, 502 provider/invalid AI
output, 503 missing provider configuration, 504 timeout, 500 rendering failure.
Provider responses and secrets are not echoed or logged. No automatic paid retry
or silent fallback from AI to deterministic output is performed.

This server binds only to 127.0.0.1 and rejects foreign Origin/Host headers for
API calls. It is a local single-user prototype, with no production identity or
multi-tenant authorization. Exposing it publicly requires an authenticated service,
authorization, session-bound downloads and deployment configuration. Rate limits,
real tenant consent, refresh tokens and production hosting are outside this task.

## Sources

- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Copilot Chat API limitations and licensing](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/api/ai-services/chat/overview)
- [Copilot chat request](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/api/ai-services/chat/copilotconversation-chat)

The canonical story includes a mandatory common overview and follows reference
slides 10–11. See `PRESENTATION_STANDARD.md` for enforced content and theme rules.

Identical validated requests reuse a ready file until its original expiry; scope,
content, provider/model and standard versions participate in the cache key. This
avoids charging another model call just because the main page was reloaded.
