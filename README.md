# Lindström customer review demo

The account manager opens a customer review based on synthetic workwear data.
The single-page workspace has separate data-analysis and dashboard-editing
conversations. It creates an editable PowerPoint with the Lindström theme from
the supplied reference and can open it in desktop PowerPoint on Windows.

## Run locally

Use Node 24 and pnpm 11.25.0. Run these commands from the repository root:

```sh
pnpm install --frozen-lockfile
node scripts/preview.mjs
```

Open [the local demo](http://127.0.0.1:4173/kopperoinenp/index.html).
For a local run without provider credentials, copy [the environment example](.env.example)
to `.env` and keep the deterministic setting. PowerPoint generation works in this mode.
Both assistant conversations require an AI provider. Set `PRESENTATION_PROVIDER=openai`,
`OPENAI_API_KEY` and optionally `OPENAI_MODEL` (default `gpt-5-mini`) in the local
`.env`, then restart the backend. Credentials stay on the server.
`PRESENTATION_PROVIDER=copilot` uses `COPILOT_ACCESS_TOKEN`; the adapter awaits
live tenant verification. Production authentication and token refresh are not implemented.

Python 3 is needed to read CSV and XLSX uploads. Create a local environment
with `python -m venv .venv` and install the development tools with
`.venv/Scripts/python -m pip install -r requirements-dev.txt` on Windows.
Set `PYTHON` if your Python executable has another location.

## Use the assistants

1. Select a customer and open the review.
2. Open **Data analyst** to ask for figures, comparisons or analysis. It checks
   the tool catalog before choosing a calculation. When needed, it inspects
   available columns and creates a validated sum or percentage tool.
3. Open **Dashboard editor** to add or remove blocks, change scope, edit text
   or record next steps. It keeps the review's structure and returns a change
   acknowledgement.
4. Each block has **Ask**, **Edit** and a trash button. Ask opens the analyst
   with the block title. Edit opens the editor. Required blocks have a disabled
   trash button.
5. **Upload files** accepts CSV, XLSX and JSON. To make uploaded data available
   to tool creation, select schema sharing and include a matching customer ID.
   Matching files are retained in server memory for up to 30 minutes.
6. Use **Open presentation** to open the PPTX on this Windows machine or
   **Download PowerPoint** to save it.

The two conversations have independent message histories. Analysis leaves the
dashboard unchanged. The editor can ask the analyst for evidence internally
without adding messages to the analysis conversation.

See [assistant behavior and limits](docs/ASSISTANTS.md) for supported calculations
and shared-mode scope rules.

## Check the project

```sh
node scripts/check-quality.mjs
node --test tests/assistant-harnesses.test.mjs
```

Test ordinary Finnish and English requests against the configured AI provider,
without example conversations or tool names:

```sh
node scripts/test-assistant-harnesses.mjs --live --repeat=2
```

The quality command runs Ruff, ESLint, Prettier and Node tests.
The live command makes provider calls and writes its acceptance report to
`.local/harness-live-results.json`.
PostgreSQL integration tests are separate. See [quality setup](QUALITY.md) and
[shared prototype](docs/POSTGRES_PROTOTYPE.md) for those prerequisites.

Source files belong in `backend/`, `frontend/mockups/kopperoinenp/`, `scripts/`
and `tests/`. Runtime reviews, logs and temporary outputs belong in the ignored
`.local/` directory. Provider credentials belong in a local `.env`.

## Work on the demo

- [Project overview](docs/project-overview.md)
- [Architecture](docs/architecture.md) and [local API contracts](docs/api-contract.md)
- [Agent rules](AGENTS.md) and [development workflow](docs/development-workflow.md)
- [Quality checks](QUALITY.md), including setup for `pnpm check`
- [Review storage](docs/REVIEW_STORAGE.md), [imports](docs/IMPORT_ANALYSIS.md)
  and [presentation rules](docs/PRESENTATION_STANDARD.md)
- [Source and asset provenance](docs/references/README.md)

Remaining verification includes interactive browser/PowerPoint and PDF layout
checks, Copilot tenant testing and production authentication. The current
buildless interface and Node backend remain the approved stack.
