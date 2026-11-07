# Lindström customer review demo

The account manager opens a customer review based on synthetic workwear data.
The two tabs cover the customer summary and detailed data. The summary supports
scoped review edits through chat and opens a browser presentation with a download
option for an editable PowerPoint.

## Run locally

Use Node 24 and pnpm 11.25.0. Run these commands from the repository root:

```sh
pnpm install --frozen-lockfile
node scripts/preview.mjs
```

Open [the local demo](http://127.0.0.1:4173/kopperoinenp/index.html).
For a local run without provider credentials, copy [the environment example](.env.example)
to `.env` and keep the deterministic setting. PowerPoint generation works in this mode.
The editing chat requires an AI provider. See [backend setup](backend/README.md)
for OpenAI configuration and the status of the Copilot adapter.

## Work on the demo

- [Project overview](docs/project-overview.md) and [roadmap](docs/NEXT_STEPS.md)
- [Architecture](docs/architecture.md) and [local API contracts](docs/api-contract.md)
- [Agent rules](AGENTS.md) and [development workflow](docs/development-workflow.md)
- [Quality checks](QUALITY.md), including setup for `pnpm check`
