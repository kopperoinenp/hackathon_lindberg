# Analysis and dashboard assistants

Owner: Paulus Kopperoinen. Implementation and integration: kopperoinenp Codex.
The task owner authorized two separate harnesses, tool creation, internal
coordination, separate conversations and block action routing in chat on
8 November 2026.

## Data analyst

`POST /api/chat/analysis` accepts the existing message, history, workspace
and optional lastQuery fields. Its model sees an analysis-only schema and
instructions. It checks the query and tool catalogs first, then follows one route.

- A normal lookup selects an explicit metric tool, then extracts its filters in
  a separate step and runs the existing data-query calculation.
- A specialist analysis selects the existing tool with the required outputs.
- A generated tool is reused only for the same owner, customer, data and scope.
- If no tool matches, the harness inspects the available table/column types,
  requests one declarative definition, validates it and runs it locally.
- Missing evidence and unsupported calculations produce an explanation.

Generated tools use a single table, an additive sum or a subset/total percentage.
They require at least three rows, complete numeric columns, no duplicate rows,
finite results and sample reconciliation. Sums additionally require an allowed
additive column and a matching unit. Snapshots, stock, rates, targets and
intensities cannot be summed. Joins and arbitrary executable code are unsupported.
Raw rows remain on the backend during tool creation. Column labels and types
are sent to the configured provider.
Uploaded numeric columns also appear as prospective tools in discovery. These
are built and validated only after selection. Recipe fields are restricted to
the discovered table and column IDs. The raw-column catalog describes new-tool
inputs; existing tools retain their own separate data sources.

Results include source information and a trace of catalog inspection, schema
inspection when needed, validation and execution. The response always has an
unchanged workspace and an empty changed list.

Generated tool definitions and matched uploads have a 30-minute in-memory
lifetime and bounded caches. They are scoped to the authenticated prototype
identity or the local single-user instance. Restarting the backend clears them.
An uploaded dataset becomes eligible only when its customer match is verified
and the user selected schema sharing. Unknown customer matches remain reports.
Filters that uploaded rows cannot support produce no eligible rows.

In shared mode existing calculations use the prepared dashboard tools. New
calculations require available raw rows or an eligible uploaded source. The
harness reports missing evidence when those sources are unavailable.

## Dashboard editor

`POST /api/chat/dashboard` accepts message, history and workspace. Its model
sees a patch-only schema. It cannot return a dataQuery, a numeric answer or a
savings estimate. The existing patch validator checks scope, customer access,
text provenance, slide IDs, source-data protection and required content.

The review order is customer context, previous goals, summary, common overview,
evidence, improvement proposals, agreed actions and sources. New modules and
evidence areas are ordered by server-side rules. Existing selections and
customer-owned text are preserved unless explicitly changed.

If an edit needs new evidence, the editor can issue one internal analysis
request. The analyst checks tools and executes its calculation. The editor
receives that evidence before returning its final validated patch. The browser
shows the editor's change acknowledgement only. Internal work is available in
the trace and does not become a second user's conversation.

## Conversation interface

Data analyst and Dashboard editor have separate in-memory histories, prompts and
follow-up context. Switching tabs retains each conversation. Customer changes
clear both histories. A response belongs to the conversation that sent it even
if the user switches tabs while waiting.

Three animated dots accompany the pending state. Reduced-motion preferences
disable their movement. The wider conversation reserves space for answers,
charts and calculation tables. Suggested questions are limited to two initial
options and one follow-up.

Block actions are trash, Ask and Edit. Ask opens the analyst. Edit opens the
dashboard editor. Both include the block title in the input so the user can
complete the request. Required blocks cannot be removed.

## Compatibility and verification

The original `POST /api/chat` remains available for older callers and tests.
The maintained frontend uses the two dedicated endpoints. Request limits,
same-origin checks, provider transport and shared snapshot checks still apply.
No database schema changes are needed.

`tests/assistant-harnesses.test.mjs` covers read-only analysis, generated tools,
scope isolation, invalid definitions, canonical block ordering, editor response
boundaries and internal collaboration. Live browser tests require Computer Use
to be enabled in Work settings. Provider calls require configured credentials.

`node scripts/test-assistant-harnesses.mjs --live --repeat=2` exercises ordinary
Finnish and English requests with empty histories and no tool names in the
requests. It checks totals, emissions components, service duration, dashboard
edits, period filters, titles, agent boundaries and a new uploaded-data tool.
The local report is written to `.local/harness-live-results.json`.
