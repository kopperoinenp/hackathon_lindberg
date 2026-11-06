# Code quality

Development checks are configured independently of the future application stack.
The prototypes remain buildless static HTML/CSS/JavaScript. Python is used only
for optional source-fixture regeneration.

Use Node 24, pnpm 11.25.0 (declared in package.json), and Python 3.11 or newer.
Install pnpm with your standard Node package-manager tooling if it is missing.

```sh
python -m venv .venv
# Windows:
.venv/Scripts/python -m pip install -r requirements-dev.txt
# macOS / Linux:
.venv/bin/python -m pip install -r requirements-dev.txt
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` uses `.venv` when present, otherwise `python` from PATH. Set `PYTHON`
to an executable path to override this. The same command runs in CI and stops
with a nonzero exit code on the first failure.

| Check | Scope | Command |
| --- | --- | --- |
| Ruff lint | Python files, default tool/virtualenv exclusions | `python -m ruff check .` |
| Ruff format | Python formatting | `python -m ruff format --check .` |
| ESLint | Frontend mocks, scripts and tests | `pnpm lint` |
| Prettier | Mock HTML/CSS/JS/docs and quality configuration | `pnpm format:check` |
| Node tests | Synthetic-data calculations and preview smoke test | `pnpm test` |

Ruff enables E/F error checks, import ordering, bugbear and Python modernization.
Its configuration follows [the official Ruff configuration format](https://docs.astral.sh/ruff/configuration/).
ESLint uses its recommended JavaScript rules plus strict equality checks.
Prettier formats authored files. Generated `data.js` is excluded from ESLint and
Prettier, but imported and validated by the model tests.

To fix authored formatting: `pnpm format` and `python -m ruff format .`.
Use `python -m ruff check . --fix` for the automatic lint fixes you intend to review.
No formatting command should be run against unrelated team files without agreement.

The `Code quality` GitHub Actions workflow runs on every push and pull request.
Its `Lint, format and tests` job installs locked JS tooling and pinned Ruff,
then runs `pnpm check`. Workflow permissions are read-only, stale runs are
cancelled and there is no deployment, secret requirement or auto-merge.

These are automated code checks, not a human PR approval or a configured AI
reviewer. A teammate still reviews the PR. Making the CI job required for merge
needs a separate repository branch-rule decision; branch settings are unchanged.

The existing local repository scaffold is preserved. Only the new prototype
and quality-tooling files are part of this change. Ignore development artifacts
such as node_modules, .venv, Ruff caches and local credentials when maintaining
the shared scaffold. Dependency manifests and pnpm-lock.yaml are intentional.
