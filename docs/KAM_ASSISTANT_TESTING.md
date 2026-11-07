# KAM assistant acceptance package

Owner: kopperoinenp. Existing HTML/JS + Node implementation; no new API or dependencies.

## Run

- `npm run test:kam`: offline regression tests for validated workspace changes, factual
  reply checks, customer persistence, concurrency and export selection. Provider responses
  are explicitly stubbed here; these tests do not evaluate natural-language interpretation.
- `npm run test:kam:live`: run all 26 scenarios twice against the configured provider.
  Requires the existing backend `.env`. Makes paid API calls with synthetic fixture data.
  Does not touch saved customer profiles or source data. Detailed JSON results, provider
  patches, errors and elapsed times are saved under ignored `work/kam-evaluation/`.
- A focused rerun: `node scripts/test-kam-assistant.mjs --live --repeat=2 --cases=slide-title,year-comparison`.
- `npm test`: all regression tests, including PowerPoint byte/content checks.
- `node scripts/check-quality.mjs`: the repository quality gate.

Each live run creates a fresh workspace per scenario. The country follow-up supplies
explicit conversation history. Assertions inspect structured state and calculated facts,
not exact model phrasing. Errors count as passes only for cases explicitly expecting
validation/rejection. Provider outages and timeouts are failures; no silent retries.
Inspect the JSON replies as well: state assertions cannot prove all prose is correct.

## Scenarios and acceptance

| ID                         | KAM task                                        | Expected result                                                 |
| -------------------------- | ----------------------------------------------- | --------------------------------------------------------------- |
| greeting                   | Say hello                                       | Useful reply; no state change                                   |
| thanks                     | Thank the assistant                             | Useful reply; no state change                                   |
| empty                      | Send an empty request                           | Validation error                                                |
| too-long                   | Send an oversized request                       | Validation error                                                |
| textile-count              | Ask current garment count                       | Latest snapshot count, not annual sum                           |
| repair-count               | Ask annual repairs                              | Correct period total                                            |
| water-source               | Ask total water usage                           | Correct query, total measure and source                         |
| missing-cross-sell-savings | Ask hygiene service savings                     | Missing information acknowledged; no invented money             |
| unavailable-profit         | Ask operating profit                            | Missing information acknowledged                                |
| country                    | Show Sweden                                     | Country filter changes                                          |
| follow-up-country          | Ask “Entä Suomessa?” after a filter command     | Finland; period and KAM edits preserved                         |
| quarter                    | Show Finland Q1                                 | Correct country and January–March range                         |
| typo                       | Request with a typo                             | Correct country filter                                          |
| dashboard-priority         | Prioritize repairs                              | Main graph changes to repairs                                   |
| hide-water                 | Hide water on dashboard and slides              | Both selections change                                          |
| exact-note                 | Set a meeting note                              | Exact supplied note in the note field                           |
| slide-title                | Rename the first slide                          | Exact cover title; no order change                              |
| slide-swap-with-upsell     | Swap first two slides after approving an upsell | Original slides swap; approved proposal stays last              |
| customer-switch            | Switch customer                                 | Old customer's notes, estimate and internal description cleared |
| manager-savings            | Enter a decimal EUR estimate                    | Exact value, labeled as KAM estimate in slides                  |
| clear-savings              | Clear the estimate                              | Estimate becomes null                                           |
| relationship-internal      | Set yellow status                               | Status retained internally; absent from slides                  |
| ambiguous                  | Request “Muuta sitä”                            | No guessed edits, or explicit rejection                         |
| unsupported-data-edit      | Ask to rewrite source water data                | Rejected; not converted into slide commentary                   |
| year-comparison            | Compare same months last year                   | Year-on-year analysis; original review period preserved         |
| question-preserves-edits   | Ask a question after KAM edits                  | Answer without changing the review                              |

## Browser acceptance workflow

Use a separate preview process and a fresh `REVIEW_STORE_DIR` under `work/`, with the
configured provider. Never overwrite the user's saved reviews for a test.

1. Choose **Change the dashboard**, enter a KAM estimate and confirm it is labeled.
   While pending, verify the text field and send button prevent a second request.
2. Filter to Sweden; follow with Finland. Check filters, totals, original note and estimate.
3. Set a cover title. Approve one service proposal, swap the first two review slides,
   open the presentation and download the PPTX. Confirm the title, order, estimate,
   selected proposal and absence of relationship badges.
4. Switch customers and back, then reload. Verify changes belong only to the edited customer.
5. Ask for a missing financial fact; confirm a clear refusal and unchanged dashboard.
6. Open Explore data; ask for a same-month year-on-year comparison and confirm the
   analysis uses available prior-year data instead of claiming it is missing.

## Limits

This is a finite acceptance sample, not a guarantee of all future language-model answers.
The numeric reply guard rejects numbers absent from supplied facts, but semantic causes
and recommendations still require human review. External CRM/tenant data, production
authentication, actual customer contracts and provider load testing are outside this fixture.

## Execution record — 2026-11-07

- Initial live run: 18/26 passed. One failure was an overly narrow refusal-wording
  assertion, one was a provider timeout; the remaining failures exposed routing and
  workspace bugs. The assertion was corrected without weakening the unchanged-state check.
- Repeated full run during fixes: 49/52 passed. Two year-comparison failures led to
  the final authoritative analysis-route fix; the other failure was a provider timeout.
- Final complete live run: **26/26 passed** (`live-1794078709368.json`).
- Final focused year-comparison run: **2/2 passed** (`live-1794078605867.json`).
- Automated suite: **96/96 passed**. Full quality gate passed in an isolated copy
  with normalized line endings, because the original Windows checkout has a pre-existing
  Python CRLF formatting failure. No unrelated source formatting was changed.
- Browser on port 4176 with isolated reviews and the real provider: KAM estimate,
  disabled controls during a pending turn, country filter persistence, exact slide
  title, approving a service proposal after a chat turn, swapping original slides,
  presentation preview, actual PPTX download, customer isolation and reload checked.

Fixes cover title edits incorrectly treated as swaps; swaps broken by approved final
proposals; explicit source-data edits being substituted with source-slide commentary;
invented small numbers and years passing the reply checker; follow-up and note routing;
year-on-year requests being downgraded to monthly charts or undone by the second model
pass; and approval checkboxes remaining disabled after a chat turn. The removed v2 page's
entry URL now redirects to the maintained workspace instead of returning 404.

These results apply to the tested fixture and configured provider, not future model
responses or production tenant data. Provider timeouts remain possible and are reported
as failures rather than hidden by retries.

## Integration with GitHub main 2af7a4e

The compatibility version retains the newer customer chooser, meeting preparation,
file import, steering signals and analysis replies. The second analysis stage uses its
validated scope and view while retaining the new reply flow. Meeting notes and audience
are cleared on backend customer changes, with a regression test. The editable slide index
excludes approved final opportunities; the rejection test accepts its updated error message.

Integration verification: **119/119 Node tests**, full quality gate in the normalized copy,
and **8/8 focused real-provider cases** passed. The 26/26 complete run above was performed
before this integration; it is not presented as a new full live run on the integrated version.
Browser checks confirmed the new customer chooser and review rendering without captured
console errors. The API contract and dependency versions are unchanged.
