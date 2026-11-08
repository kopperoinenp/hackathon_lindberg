# Demo architecture

The buildless HTML, CSS and JavaScript frontend lives in
[`frontend/mockups/kopperoinenp`](../frontend/mockups/kopperoinenp/).
The local Node 24 server serves the frontend and handles requests for review chat,
cooperation summaries and presentations. It binds to the loopback interface.

The frontend validates the active synthetic dataset before analysis. The frontend
and backend reuse analysis modules to calculate customer metrics and build the
review story. The review agent can request scoped analysis through defined tools.
The backend validates its proposed edits before returning them to the browser.
The presentation service generates editable PPTX files with PptxGenJS.

The maintained chat uses separate analysis and dashboard-editing harnesses in
`backend/assistant-harnesses.mjs`. Analysis selects existing tools or creates
validated declarative calculations through `backend/analysis-runtime.mjs`.
The editor applies the existing validated patch contract and can request
analysis internally. Their conversation histories and UI tabs are separate.
See [assistant behavior](ASSISTANTS.md).

Provider configuration and credentials stay on the backend. OpenAI is supported,
and the Microsoft 365 Copilot adapter awaits live tenant verification.
Deterministic mode supports local presentation generation. See
[setup](../README.md) and [analysis tools](ANALYSIS_TOOLS.md).

React with TypeScript and Python with FastAPI remain proposals.
The optional [PostgreSQL prototype](POSTGRES_PROTOTYPE.md) persists shared customer
datasets and personal reviews with selectable demo profiles; it deliberately has no sign-in.
The [phase-two fixture pipeline](FIXTURE_IMPORT_PIPELINE.md) stages repository-owned
synthetic data in PostgreSQL, processes a durable queue in a separate Node worker and
atomically publishes validated customer versions without altering personal reviews.
Production sign-in, large-file ingestion and deployment remain open decisions.
The [dashboard metrics API](DASHBOARD_METRICS.md) reads scoped results prepared by the
PostgreSQL worker. The shared dashboard fetches customer metadata and versioned results.
The file preview remains available as a standalone synthetic demo.
