# Review editing API

## POST /api/cooperation

Input `{description}` is a nonempty manager-authored relationship description,
maximum 2000 characters. The configured AI provider returns a validated
`{status:"green"|"yellow"|"red"|"unrated",reason}` with a Finnish explanation
(maximum 400 characters). Green means smooth cooperation, yellow concerns needing
follow-up, red serious unresolved issues/risk, unrated insufficient information.
The response is a suggestion, not source-data evidence. The dashboard has no
assessment controls. The relationship rating can be set through review chat and
is passed to the presentation request.
Same-origin checks, request limits and the shared chat concurrency lock apply.

## KAM editing tools

`dashboardLayout` changes actual dashboard structure, not meeting notes. Null
preserves it; otherwise `{sections,metrics}` selects visible modules in order and
KPI cards in order. Modules: overview, intro, savings, metrics, results, charts,
opportunity, plan. KPI IDs: allocated, sites, scanned, unscanned, washed, water,
emissions, repairs. Both lists must be nonempty, unique and use known IDs.
Omitted modules are hidden. The frontend moves the existing sections and charts,
recalculates selected cards from the current scope, and retains both navigation
tabs and chat. Layout is included in workspace snapshots and returned after edits.
It does not alter PowerPoint selections or computed source data. The user can
restore defaults with the dashboard button or a chat request.

The structured patch also supports `savingsText`, `cooperation` and `slideEdit`.
`savingsText` is an exact substring of the current instruction, for example
`40000EUroa` or `40 000 euroa`; it sets an EUR estimate shown on the dashboard
and cover/plan slides. An empty string removes it, null preserves it. The server
validates the amount, never computes or invents savings, and labels it as a KAM
estimate rather than verified source evidence.

`cooperation` sets the KAM traffic light: green/yellow/red/unrated, or null to
preserve it. `slideEdit` is null or `{id,title,text}`; resolve the ID from the
current presentationSlides. Title/text are exact substrings from the current
instruction (null preserves, empty string clears). Text is added as labeled KAM
commentary; source calculations and mandatory limitations remain intact.

Workspace and presentation requests preserve optional `savings:number|null` and
`managerTexts:{slideId:string}`. Customer/data-scope changes clear scoped estimates
and commentary before applying new instructions. These backward-compatible tools
extend the user-authorized KAM editing workflow, without new external endpoints.

Owner: Paulus Kopperoinen. User-approved scope, 2026-11-07: connect the existing
summary chat to the AI provider to edit the current page. The user subsequently
required action-only behavior, with a short completion acknowledgement.
This adds one local interface; existing presentation requests remain compatible.

## POST /api/chat

JSON input: `{message, history, workspace}`.

- `message`: nonempty instruction, at most 1,000 characters.
- `history`: at most six `{role: "user" | "assistant", content}` entries,
  each at most 1,800 characters. Omitted means empty.
- `workspace`: existing presentation request `{scope, included, note, titleEdits}`
  plus `view`, `metric`, `summaryMetric`, `visibleInsights`, `heading`.
  Defaults match the current review. Scope is customer, from, to, country,
  continent, site, baseline and priority. Available IDs come from the fixture.

The provider returns a strict, all-fields-required nullable patch. Null preserves
state. Allowed edits are those scope fields, summary/analysis view, chart metric,
visible insight IDs, PowerPoint insight IDs, the summary heading, cover title and
manager note. Text must be supplied verbatim in the current user instruction.
No executable HTML/CSS/JS, arbitrary components, figures or source-data edits are
accepted. At least one insight must remain selected. Mandatory deck chapters stay.
Unsupported, ambiguous or question-only requests return an empty patch.

JSON success: `{workspace, changed, reply}`. `changed` is the list of modified
field paths. `reply` is exactly `Done` or `No changes.`. The browser displays
only that status. It renders all user text as escaped text and recalculates the
charts through deterministic models. Customer changes clear customer-specific
notes/titles/selections; other data-scope changes clear notes and edited titles.
A country follow-up preserves the period and priority. Site/customer membership
and nonempty data are checked before the entire patch is applied.

A response is ignored if the page scope or client revision changed while awaiting
it. A failed request never falls back to simulated success or partially applies.
Errors use `{error}`: malformed requests 400, foreign origin 403, oversized body
413, concurrent chat 429, provider/invalid output 502, disabled AI mode 503.
The UI displays a short error when the edit fails. Exact provider transport
errors retain the shared adapter's status mapping.

## Boundaries

Loopback only, same-origin POST checks, 32 KiB request limit, one chat request at a
time. Shared provider transport uses a 90-second deadline, no automatic retry,
fixed HTTPS endpoints, bounded responses and strict structured output. The
browser times out after 95 seconds. API keys remain server-side and are never
included in prompts, responses or frontend variables. Chat content, recent
history, current workspace, synthetic catalog and computed evidence are sent to
the configured provider. OpenAI requests use `store:false`; no application chat
database is added. Do not enter confidential production data into this demo.

OpenAI is the tested local provider. The same structured-generation adapter has a
Copilot implementation, but live Copilot tenant access has not been tested.
The Microsoft wire protocol and authentication differ from OpenAI.

## Verification, 2026-11-07

All 33 Node tests, Ruff, ESLint and Prettier passed locally. New tests cover atomic
patches, invalid IDs/ranges, text provenance, customer resets, follow-up context,
provider failure, history bounds and local HTTP validation. Browser testing with
real OpenAI calls verified Finland January–March, emissions emphasis, two selected
insights, then Sweden with period/priority preserved and an explicit new heading.
Both edits displayed only `Valmis`. Native PowerPoint application compatibility,
live Copilot and production multi-user operation were not tested in this change.

## Slide edits and truthful acknowledgement

Task-owner-approved extension, 2026-11-07: workspace carries optional `slideOrder`.
The model patch now requires `supported:boolean` and nullable `slideSwap` with
`first`/`second` integer 1-based positions. The server swaps existing slide IDs,
validates the resulting deck, and stores its order for both native and browser
export. Invalid, equal or out-of-range positions fail without changes. Model
output cannot silently substitute priority or insight selection for a requested
slide swap. Unsupported requests return 422 with a short message, never `Done`.
The rest of the strict nullable patch contract remains unchanged.

The extension passed all 34 tests plus Ruff/ESLint/Prettier. A real OpenAI browser
request using the original Finnish typo ("ekan ja tiosen dian") applied the swap.
The regenerated browser deck showed the common overview as slide 1/9 and the
customer cover as slide 2/9. The HTTP test separately checked the actual generated
PPTX slide1.xml and slide2.xml contents. kopperoinenp Codex owns integration and
merge after successful review/CI under the updated AGENTS.md authorization.
