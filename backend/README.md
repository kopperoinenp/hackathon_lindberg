# Local presentation service

Run from the repository root using Node 24:

```powershell
pnpm install --frozen-lockfile
node scripts/preview.mjs
```

Open http://127.0.0.1:4173/kopperoinenp/index.html and press **Open presentation**.
The current customer presentation opens in a new browser tab; the adjacent download
icon saves the genuine editable PowerPoint. The viewer has slide arrows and a
download icon. There is no separate generation dialog or technical export wizard.
Unchanged ready presentations are reused without another paid model call. Changes
invalidate the cached link. For live development use `node --watch scripts/preview.mjs`.

The server loads a root `.env` if present. Configure values locally, never in
frontend code or committed files. Example variables are in `config.example.env`.
The current user-provided key is stored only in the ignored local root `.env`.
Never put a real key into an example file or a PR.

## OpenAI first

Set `PRESENTATION_PROVIDER=openai`, `OPENAI_API_KEY` and optionally `OPENAI_MODEL`
(default `gpt-5-mini`). The model chooses approved headline variants and ordering
from computed evidence. It does not generate arbitrary slide prose or numerical
claims in this first integration. Presentation planning sends only the selected synthetic customer's computed
insights; manager notes/title edits stay out of that presentation prompt. The
editing chat sends its instruction, recent history, workspace, synthetic catalog
and computed evidence. See `docs/CHAT_API.md` for the separate chat contract.
Presentation calls happen when the user opens a new presentation. Chat instructions also
make paid calls through the same provider. No paid calls
run in the automated tests; provider behavior is tested with injected HTTP fakes.

## Switch to Microsoft 365 Copilot

Set `PRESENTATION_PROVIDER=copilot` and `COPILOT_ACCESS_TOKEN` in the backend's
local environment. This is a delegated Microsoft Graph access token, not an API
key. The adapter is implemented and tested against the documented response shape;
it has not been verified against a licensed tenant. Existing tokens expire;
production Microsoft sign-in and refresh-token storage are not implemented.

Microsoft currently requires a work/school user with a Microsoft 365 Copilot
add-on license and all these delegated permissions for the Chat API:
Sites.Read.All, Mail.Read, People.Read.All, OnlineMeetingTranscript.Read.All,
Chat.Read, ChannelMessage.Read.All, ExternalItem.Read.All. These are broad access
scopes. The tenant administrator must assess and approve them; this application
does not grant permissions. Personal accounts and application-only authentication
are not supported by this API. The endpoint is beta, not production-supported.

Copilot returns text, not `.pptx` files. Our generator and calculation layer are
unchanged when switching providers. Web grounding is disabled per request; work
grounding remains part of Copilot, so the returned plan is validated against the
only allowed insight IDs and headline variants before use.

## Explicit offline operation

`PRESENTATION_PROVIDER=deterministic` generates a real PPTX without an AI call.
The generated notes and metadata identify this mode; the UI makes no AI-authorship claim.
API errors are shown explicitly rather than silently switching to this mode.

## Quality and limits

`pnpm check` runs backend/frontend lint, formatting and all tests in CI as well.
PPTX generation uses pinned PptxGenJS and native editable charts with embedded data.
The native PowerPoint reuses the supplied reference master, blank layout, theme,
logo, Libre Franklin/Libre Franklin Black font declarations and exact slide size.
The reference is checksum-locked. This is not a claim of a separately approved
public POTX template. Source comparison and
synthetic-data limitations accompany the figures.

The service is loopback-only. No database or cloud upload is needed. It is not a
production multi-user backend. See `docs/PRESENTATION_API.md` and `docs/UI_BASELINE.md`.

## Verified in this implementation

A real OpenAI Responses API call with the user's authorized local key completed
successfully and produced a customer PPTX. The downloaded package
was imported with the bundled presentation runtime, all generated slides were
rendered and visually inspected. Automated checks verify native charts, embedded
workbooks, presenter notes and scoped data. This is not a claim of native Microsoft
PowerPoint UI testing or a live Copilot tenant test.

The enforced narrative and common/personalized structure follow reference slides
10 and 11; see `docs/PRESENTATION_STANDARD.md`. Transport follows bounded-call
patterns: fixed endpoints, no redirects/retries, one overall timeout, bounded
response bytes and explicit response-shape checks. Restart after changing `.env`.

## Review editing chat

The summary chat now applies validated scope, chart, insight-selection and explicit
text edits through `POST /api/chat`. It acknowledges only `Done` or `No changes.`.
It cannot change calculations or execute generated page code. No fake keyword
response is used when the API fails. `deterministic` mode disables this chat.
See `docs/NEXT_STEPS.md` for the reference-deck-based project roadmap.
