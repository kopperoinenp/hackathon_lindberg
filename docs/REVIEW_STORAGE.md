# Customer review persistence

The optional [PostgreSQL prototype](POSTGRES_PROTOTYPE.md) stores shared customer
datasets and per-profile reviews in PostgreSQL. It uses selectable demo profiles,
not authentication. `pnpm preview:shared` enables it; the file-store behavior below
remains the default for `pnpm preview`. Existing local files are preserved.

The local single-user backend saves one current review per customer under
`.local/reviews/`, ignored by Git. `REVIEW_STORE_DIR` overrides the directory for
tests/deployment. Data is independent of the synthetic source fixture and survives
service restarts. Only validated workspace settings are stored: scope, dashboard
layout, visible metrics, headings, manager commentary, notes, estimates, relationship
color, contract KPIs, agenda inclusion and presentation choices. API keys, generated files and chat history are not
stored here. Language remains a browser preference.

- `GET /api/reviews/{customer}` returns `{customer,revision,updatedAt,workspace}`.
  A new customer has revision 0 and null workspace. Unknown customers return 404.
- `PUT /api/reviews/{customer}` accepts `{revision,workspace}`. Customer IDs must
  match and workspace uses the same validator as chat. An outdated revision returns
  409 without writing. Existing same-origin and 32 KiB limits apply.

Writes are serialized in this process and use a temporary file plus atomic rename.
Invalid/corrupt saved records fail visibly and are never overwritten with defaults.
This store is intended for one local Node process, not multi-process production
hosting. Production needs authenticated ownership and shared transactional storage.

The UI loads the saved review on startup/customer selection, saves edits after a
short debounce, and waits for assistant-edit saves before completion. The browser
remembers the selected customer ID separately in each tab (sessionStorage). The persistent storage indicator reports
loading/saving/saved/errors. On conflicts, reload rather than overwriting another
window. Switching customers flushes pending changes and loads that customer's
saved review; assistant customer switches also load
the saved target review before accepting further edits. Chat transcript is intentionally session-only.

Every customer has one dashboard. On first open, the UI displays the defaults.
The first edit creates the saved review. After that, edits from the dashboard and
the assistant are saved to the same record, and reopening the customer restores
them. There is no mode to choose and nothing to create by hand. If the first save
fails, the default view stays usable and the storage indicator says the changes are
only on this page. Reset dashboard asks for confirmation before it saves the default
layout. Assistant edits and customer switching wait until the selected review has
loaded. There is no global saved review shared across customer IDs.

Tests cover disk persistence across a new store instance, customer isolation,
concurrent/stale revisions, validation/corruption, and actual HTTP PUT/GET/409.

Contract KPIs are part of the validated workspace: `contractKpis` contains up to
12 entries (label, evidence area, actual, target, source, priority), of which up to
three may be highlighted. `includeContractAgenda` persists the export selection.
Older records default to an empty list and false. Creating/editing/removing a KPI
or changing agenda inclusion triggers the same autosave queue as dashboard edits.

KAM commentary, savings estimates, custom headings and slide choices belong to the
customer and survive date/country/site/baseline filtering and clearing filters.
They remain manually supplied material, not recalculated evidence. Selecting a
different customer loads that customer's profile. The AI patch validator also
preserves KAM material for same-customer scope changes and clears it on a customer
change. The assistant stays available in both workspace tabs.

The review also stores the role the account manager is meeting and whether usage figures are hidden. Hidden usage removes the adoption area, the opportunity section and slide, and every scan figure from the customer review and presentation. Explore data and the account manager's panel still show them.

The workspace follows a meeting. It opens on one customer search, with recently opened customers below it and no figures. Opening a customer starts Prepare, where only the manager sees the role, questions, usage signal, areas and private notes. The page shows the deck itself: one card per slide, built by the same code as the file and without AI changes, so the preview and the PowerPoint match. The manager edits a slide in place or with the assistant, and approves it. Approval makes the PowerPoint available; any later edit takes the review back to approval. Internal notes, questions and signals never go into the file, because it can be sent to the customer.

The service performance section compares a site's service cycle P90 with the median
P90 of other sites in the selected customer and filters. Sites must cover the same
observed months and have at least 30 cycles overall and five per month. A finding
requires a gap of at least five hours overall and in at least half of the months. These demo thresholds
screen for usable comparisons. They do not represent a contractual target.
The section shows the comparison and monthly series.
