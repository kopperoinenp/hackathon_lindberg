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
saved review (or defaults when none exists); assistant customer switches also load
the saved target review before accepting further edits. Chat transcript is intentionally session-only.

The dashboard selector opens **Saved customer review** only when that customer's
backend record exists. An uncreated customer opens **Original template**, with the
saved-review option disabled and an explicit **Create customer review** button.
Browsing, filtering, switching customers and reloading do not create a record.
Creation saves the current template settings for the selected customer and opens
its editable review only after a successful save. Failed creation keeps the
template visible and does not present an unsaved view as an existing profile.
The selector and helper text identify the customer by name. There is no global
saved review shared across customer IDs; existing customer records are retained.

Switching to
**Original template** first flushes pending saves, keeps the full current review
in memory, and displays the original defaults for the same customer. Template
filtering is temporary and never written to the customer profile. Assistant edits,
contract KPI editing and presentation generation are unavailable in the template
preview; select the saved review to edit or export. Returning restores the saved
review's filters, layout, commentary and session conversation. Switching customers
or reloading opens the selected customer's saved review when one exists, otherwise
the original template. Switching is
blocked while assistant edits or presentation generation are running; failed saves
keep the current review visible. Reset dashboard is separate and asks for
confirmation before saving the default layout as the new preference.

Browser checks cover saved/original/saved round trips, temporary template filters,
customer switching from template mode and reloading from template mode, verifying
that the saved review's monetary estimate and filters remain unchanged.

Tests cover disk persistence across a new store instance, customer isolation,
concurrent/stale revisions, validation/corruption, and actual HTTP PUT/GET/409.
