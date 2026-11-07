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

## Assistant tools

The assistant routes requests to a workspace edit, a scoped analysis view, or
a read-only data query. For `dataQuery`, the model returns structured filters, and
`backend/data-query.mjs` calculates and writes the answer with the same dashboard
functions. The model never writes figures. A successful question adds `answer` and
`source` and a chart-ready `view` to the response and leaves the workspace unchanged.
The search tool shows `view` as a chart in the chat, and the dashboard tool shows it as a
result card above the dashboard. Topics: water, emissions,
repairs, washed, scan, late, requests, energy, waste, overview, meeting, explain.
Comparisons: none, month, quarter, country, site, product, baseline. A query can also
choose totals or rates, a period, a rank and a row limit. The browser returns the last
query as `lastQuery`, so follow-up questions keep their context; the server validates it.

Free text from the user is still applied only verbatim, and a percentage in a note,
heading, title or slide text must already exist in the current evidence.

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

JSON input: `{message, history, workspace, lastQuery?}`.

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
Unsupported edits return an error. Data questions leave all edit fields null.

JSON success: `{workspace, changed, reply}`. `changed` is the list of modified
field paths. `reply` is exactly `Done` or `No changes.`. Edits may also return a
short `message` describing the changes. Queries add `answer`, `source`, `view`,
`followUps` and `query` while keeping `changed` empty. The browser escapes
user text and renders charts from computed results. Customer changes clear customer-specific
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

For requests to open the detailed analysis, the provider can select up to three internal analysis
tools before returning its final workspace patch. The server evaluates the
tools on the validated proposed scope and checks that the final patch keeps
that scope. Both calls share the existing deadline. A direct data query uses
one provider call and cannot be combined with a workspace edit or scoped analysis.
See [Analysis tools](ANALYSIS_TOOLS.md).

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

## Proposed extension: evidence blocks (awaiting owner approval)

Status: proposal from branch `feature/evidence-blocks`. The frontend part is
implemented and backward compatible; the backend part is not implemented. This
section does not change the approved contract until the owner approves it.

The Customer review section 01 now shows evidence blocks for nine areas. The KAM
chooses the areas per customer; the default comes from the customer's
`priority_topics`. The previous water/emissions/repairs cards and charts moved
into the Sustainability and Operational blocks' "Show more" and keep their
`data-insight` ids, so existing `titleEdits`, `managerTexts` and `visibleInsights`
edits still apply to them.

Area IDs: `scorecard`, `experience`, `performance`, `adoption`, `operations`,
`financial`, `sustainability`, `improvement`, `future`.

The browser already sends these optional workspace fields to `POST /api/chat`.
The current backend ignores them, which is safe:

- `evidenceAreas`: ordered list of selected area IDs (the resolved current
  selection, including the customer default).
- `areaTitles`: `{areaId: string}` replacing a block heading.
- `areaNotes`: `{areaId: string}` shown as labeled KAM commentary in the block.
- `customerBasics`: ordered list of customer basics shown before the figures:
  `scope`, `year`, `siteTypes`, `countries`, `products`, `locations`. An empty list
  shows only the always-visible name, industry, textiles, sites and countries.
  Presets in Explore data: Brief `[]`, Standard `["scope","year"]`, Full (all).
- `nextSteps`: at most five `{title, owner, due}` strings (160/80/40 characters)
  written by the KAM. Section 03 shows only steps with a title; the browser
  appends them to the presentation note as "Agreed next steps". Chat text must
  follow the exact-substring provenance rule.

The browser applies these fields from the response `workspace` only when they
are present and valid: `evidenceAreas` nonempty, unique and known IDs;
`customerBasics` unique known IDs (may be empty);
`nextSteps` at most five valid entries;
`areaTitles`/`areaNotes` known area keys and strings of at most 2,000
characters. Missing or invalid fields preserve the current state. A customer
change resets the selection to the customer default; any data-scope change
clears area titles and notes, like `titleEdits`. A block edited by chat is
added to the selection and opened automatically.

Backend work proposed for the chat owner (`backend/review-chat.mjs`):

1. Accept and return `evidenceAreas`, `areaTitles` and `areaNotes` in
   `normalizeWorkspace`, with the validation above.
2. Add a nullable `evidenceAreas` patch field (enum of the nine IDs) and an
   `areaEdit` `{id,title,text}` tool, or extend `slideEdit` IDs with area IDs.
   Title/text follow the existing exact-substring provenance rule.
3. Update the model instructions: `results` is now the evidence block module;
   describe the areas in English and Finnish, for example
   "näytä vain vastuullisuus ja palvelu" →
   `["scorecard","performance","sustainability"]`.
4. Report the changed paths in `changed` and add tests in
   `tests/review-chat.test.mjs`.

PowerPoint does not yet use `evidenceAreas`; passing it to the presentation
request is a separate, later change to `docs/PRESENTATION_API.md`.
