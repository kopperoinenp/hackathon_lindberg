# Shared development rules

These rules apply to all AI coding agents throughout this repository. Human contributors follow the same collaboration rules. Inspect `git status` and relevant diffs before editing. Preserve existing work.

## Current phase

- The Lindström account-manager customer-review demo is under active development. The current single-page interface is approved; preserve it unless the task owner requests a change.
- The existing demo uses buildless HTML/CSS/JavaScript and a local Node 24 backend. OpenAI integration is approved; Copilot uses an interchangeable backend adapter and awaits live tenant testing. React/TypeScript and Python/FastAPI remain proposals.
- Confirm requirements before introducing new frameworks, infrastructure or major architecture. Implement task-owner-authorized features within the existing stack.

## Architecture

- Always read `docs/architecture.md` before major architectural changes.
- Follow `docs/api-contract.md` when implementing API integrations.
- Respect existing project conventions. Prefer simple, maintainable solutions.
- Avoid unnecessary abstraction and overengineering.
- Do not make significant architectural changes based solely on assumptions.
- Identify assumptions before implementation when requirements are unclear. Ask the task owner when uncertainty affects scope, interfaces, or architecture.

## Scope and ownership

- Only modify files relevant to the assigned task. Do not refactor unrelated components.
- Do not modify another developer's work without explicit instructions.
- Agree on a human owner, file boundaries, dependencies, and acceptance criteria before parallel work. Record task ownership in a task/PR and team responsibilities in `docs/project-overview.md`.
- Use separate branches and worktrees for independent agents. Coordinate shared files with their owner.
- Request approval from the responsible team members before changing shared API contracts, database schemas, or major architectural decisions. Describe the proposal and affected callers first; document the approved change.

## Git collaboration

- Never commit directly to `main`; use feature branches for independent tasks.
- Never force push.
- The task owner designates **kopperoinenp Codex** as the repository integration orchestrator (approved in chat, 2026-11-07). It is responsible for reviewing PR diffs, checking ownership/interfaces and CI, and merging ready PRs into `main`.
- When the user asks kopperoinenp Codex to push changes, commit only the assigned task files to a feature branch, push, create/update its PR, review the final diff and required CI, then merge into `main` when there are no unresolved problems. Review other open PRs during integration and merge only when they meet the same conditions. Do not merge failing checks, conflicts, unresolved review findings or unapproved shared-interface changes.
- Other agents need explicit merge authorization. This orchestration rule takes precedence over older human-only merge wording in `docs/development-workflow.md`.
- Never discard uncommitted changes, including untracked files. Do not use destructive reset/clean/checkout operations.
- Inspect the working tree before editing and committing. Do not stage unrelated changes.
- Never commit secrets, credentials, or `.env` files. `.env.example` may contain placeholders only.
- Commit and push only with explicit user authorization; repository setup alone does not authorize them.
- Prefer small PRs. kopperoinenp Codex coordinates review and merges according to the orchestration rule above. Follow the remaining rules in `docs/development-workflow.md`.

## Quality

- Run relevant tests after implementing changes and builds when appropriate.
- Report checks that passed, failed, or were not executed, with reasons. Never claim unexecuted checks passed.
- Run `node scripts/check-quality.mjs` (or `pnpm check`) for Ruff, ESLint, Prettier and Node tests. Use documentation/Git checks for documentation-only changes; document skipped checks.
- Explain important architectural decisions. Document assumptions and limitations.
- Prefer small, reviewable changes and update affected documentation.
- Keep provider secrets on the backend; never expose them through frontend variables, source code, logs, or prompts.

## Task completion report

Summarize:

1. What was implemented.
2. Which files changed.
3. Tests/checks passed, failed, or not executed.
4. Remaining problems, assumptions, and limitations.
5. Whether shared interfaces were modified, and the approval if applicable.
