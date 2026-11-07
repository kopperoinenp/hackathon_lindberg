# Approved UI baseline

Owner: Paulus Kopperoinen. Decision: user confirmation in this chat, 2026-11-07.

The maintained workspace under `frontend/mockups/kopperoinenp/` is the agreed
product interface. The directory name is historical; do not create parallel
mock versions or replace the layout without a new product request.

The baseline is the UI merged to main in PR #2 (merge `85c2961`). It opens a
customer summary immediately with neutral default analysis. The second tab is
for detailed exploration. The summary chat remains visible, and the presentation
opens in a browser viewer. No onboarding or required goal form is part of this UI.

The user subsequently simplified presentation access: **Avaa esitys** opens a
separate browser tab and an adjacent icon downloads the native editable PowerPoint.
The old dialog and export wizard are removed. Main-page layout, navigation and charts
remain the baseline. Data stays explicitly synthetic.

## Approved integration scope

The user authorized a real PowerPoint exporter with an OpenAI API implementation
first, followed by a Microsoft 365 Copilot implementation behind the same internal
contract. Deterministic calculations remain outside the model. Provider secrets
stay on the backend. Existing Python/FastAPI/React planning templates remain
proposals; this small local implementation reuses the already adopted Node 24
runtime and built-in HTTP server rather than introducing another framework.

Owned files: new backend presentation modules, existing preview/API entry point,
presentation dialog and handlers, development checks, package/lockfile, related
tests and these integration documents. Existing unrelated uncommitted scaffold
files are preserved. Contract: [PRESENTATION_API.md](PRESENTATION_API.md).

## Approved editing chat

On 2026-11-07 the task owner authorized connecting the existing chat to AI for
page edits. The interaction stays in the current composer and acknowledges only
completion. Scope, chart, insight selection and explicit text edits use a validated
patch; generated executable UI code is outside this interface. See [CHAT_API.md](CHAT_API.md).
