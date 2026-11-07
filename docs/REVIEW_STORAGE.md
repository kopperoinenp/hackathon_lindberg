# Customer review persistence

The local single-user backend saves one current review per customer under
`.local/reviews/`, ignored by Git. `REVIEW_STORE_DIR` overrides the directory for
tests/deployment. Data is independent of the synthetic source fixture and survives
service restarts. Only validated workspace settings are stored: scope, dashboard
layout, visible metrics, headings, manager commentary, notes, estimates, relationship
color and presentation choices. API keys, generated files and chat history are not
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
remembers only the last customer ID. The persistent storage indicator reports
loading/saving/saved/errors. On conflicts, reload rather than overwriting another
window. Switching customers flushes pending changes and loads that customer's
saved review; assistant customer switches also load
the saved target review before accepting further edits. Chat transcript is intentionally session-only.

Every customer has one saved dashboard. The first time a customer is opened, the UI
stores the default view for that customer. After that, edits from the dashboard and
the assistant are saved to the same record, and reopening the customer restores
them. There is no mode to choose and nothing to create by hand. If the first save
fails, the default view stays usable and the storage indicator says the changes are
only on this page. Reset dashboard asks for confirmation before it saves the default
layout. Assistant edits and customer switching wait until the selected review has
loaded. There is no global saved review shared across customer IDs.

Tests cover disk persistence across a new store instance, customer isolation,
concurrent/stale revisions, validation/corruption, and actual HTTP PUT/GET/409.
