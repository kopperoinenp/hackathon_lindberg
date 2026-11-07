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

Provider configuration and credentials stay on the backend. OpenAI is supported,
and the Microsoft 365 Copilot adapter awaits live tenant verification.
Deterministic mode supports local presentation generation. See
[backend setup](../backend/README.md) and [analysis tools](ANALYSIS_TOOLS.md).

React with TypeScript and Python with FastAPI remain proposals.
Production sign-in, persistent customer workspaces and deployment are open decisions.
