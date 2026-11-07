# Dashboard metrics in the shared prototype

The task owner approved phase three with the existing synthetic dataset. The change
adds the `dashboard_jobs` migration and two endpoints for the single-page dashboard.
The existing review, assistant and presentation contracts remain compatible.

Run `pnpm preview:shared`, then select a customer. The first request for a particular
customer, date range, site, country, continent and baseline can wait for the worker.
Subsequent reads reuse the saved result. The publication and calculation versions
are part of the cache key. KAM review edits stay in their own records.

| Request                                | Response                                                                            |
| -------------------------------------- | ----------------------------------------------------------------------------------- |
| `GET /api/v1/customers`                | Selectable customer metadata and demo filter defaults                               |
| `GET /api/v1/customers/{id}/dashboard` | `202` for queued work, `200` with prepared metrics, or `422` when calculation fails |

Dashboard parameters are `from`, `to`, `site`, `country`, `continent`, `baseline`
and optional `version`. The prototype supports the 2025 reporting months. Matching
prior-year periods are calculated as part of the worker result. Omitted filters use
the full year, all sites and the local-laundry baseline. The client pins one dataset
version per customer until reload. If that version is no longer current, existing
results remain readable and a new scope returns `409` with a reload instruction.
Invalid filters return `400`. Access is checked on every request.

The shared API registers a durable calculation request when a scope has no saved
result. The background worker claims jobs with PostgreSQL row locks, reads the
versioned fixture and runs the existing metric rules. It saves ready-to-display
totals, time series, comparison figures, service statistics and proposal evidence.
A worker interruption rolls back an unfinished job so it can be picked up again.
Dashboard responses are limited to 200 KiB of calculated results per scope.
The shared preview returns `410` for the former browser dataset route.

Phase four links the assistant, preview and PowerPoint to the ready dashboard
snapshot. The task owner approved this contract update using the existing synthetic
data. Shared-mode clients send `dashboardSnapshotId` in presentation requests
and inside `workspace` in assistant requests. The backend verifies the customer's
access, scope and calculation version. A missing, stale or mismatched reference
returns `409`. The standalone file preview continues to use its fixture.

Successful responses carry `dashboard: {id, datasetVersion, calculationVersion}`.
The preview and exported deck use the same stored facts, comparisons and service
proposals. Dashboard-built review areas follow the same selection and may include
explicit KAM inputs. The PowerPoint cache key includes the snapshot reference,
which is also written to the speaker notes.

When an assistant question needs a new period or site scope, the same worker
prepares it from the active dashboard's publication, including retained published
versions. To ask for figures for another customer, open that customer's dashboard.
The initial bootstrap fixture can supply new scopes until the first import replaces
it. Previously calculated bootstrap snapshots remain readable after publication.

The prototype has no load test against production-sized data or cache retention policy.

Run `pnpm check` for the repository checks and `pnpm test:shared` for PostgreSQL
integration tests. The dashboard model tests compare the prepared results against the
existing rules across customers, periods, locations and baselines. Integration tests
cover durable work, dataset versions, profile isolation and the blocked raw-data route.
