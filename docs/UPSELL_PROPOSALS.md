# Customer-specific service opportunities

The Customer review shows deterministic discovery proposals from the selected customer's
sites, review period, allocation/scan snapshot, repair events and industry. Each card shows
the observation, sites, potential benefit, source, limitations and a next step. The current
fixture is synthetic. Contract coverage, actual unmet needs, local service availability,
pricing and financial benefits are not known; these must be confirmed with the customer.

Rules in `upsell-model.js` propose an allocation assessment below 85% scan coverage
(a discovery threshold, not a proven loss), repair coverage expansion when repair events
exist, and a conditional industry-specific hygiene or industrial wiper assessment.
No service is assumed to be missing because it is absent from the dataset. These are
discussion/pilot candidates, not quotes or verified commercial opportunities.

KAM explicitly selects checkboxes. No proposals are included by default. Selected proposals
are appended after the review's existing slides in both preview and PowerPoint. The backend
recomputes their content; submitted titles or benefits are not accepted. AI content planning
cannot select or rewrite these opportunities.

The existing presentation/review request now optionally accepts `approvedUpsells`, an array
of `{id, evidenceKey}` (maximum four, one per rule). IDs are customer-bound. Legacy reviews
default to an empty list. The same customer review store persists approvals, independently
of other customers. The existing chat interface preserves approvals, and clears them when
changing customers; it does not offer a tool for granting approvals.

Evidence keys bind approvals to customer, period, geographic/site filters and the actual
supporting values. Language changes do not invalidate them. Changed source evidence or
filters exclude old approvals from export and show a saved-approval count; returning to
the original evidence restores them. Selecting that proposal again replaces its previous
approval. The clear action removes all approvals for that customer. No new endpoint,
database, dependency or provider call is required.
