# Development workflow

Use lightweight GitHub Flow: one scoped task, one short-lived branch, one reviewable PR. Agree on owner, reviewer, file boundaries, and acceptance criteria in an issue, PR, or team task note. Keep coordination short during the 48-hour hackathon.

## Task cycle

Commands assume `origin` is the team repository. Replace example names/paths. Check `git status` before switching branches. Preserve uncommitted work on its current task branch; never reset, clean, or overwrite it to follow these commands.

1. **Update local main** from a clean working tree:

   ```sh
   git status
   git switch main
   git fetch origin
   git pull --ff-only origin main
   ```

   If fast-forward fails, inspect divergence with the owner; do not force a reset.

2. **Create a feature branch**:

   ```sh
   git switch -c feat/your-name-task
   ```

   Use `feat/`, `fix/`, `docs/`, or `chore/` followed by owner and task. Never commit to `main`.

3. **Implement a scoped task using Codex.** Have it read `AGENTS.md` and relevant docs. Supply goal, owned files, acceptance criteria, and constraints. Confirm stack before framework initialization. Shared API/schema and major architecture changes require team approval first.

4. **Review changes**, including new files, credentials, and unrelated edits:

   ```sh
   git status --short
   git diff --stat
   git diff
   git diff --check
   ```

   Inspect untracked files separately; `git diff` does not show their contents.

5. **Run relevant tests/builds.** Run `pnpm check` using the setup in [Quality checks](../QUALITY.md). For docs-only changes, check links, commands, and whitespace. Report passed, failed, and skipped checks with reasons.

6. **Commit and push** after review. Humans may use these commands; agents need explicit authorization. Stage only intended files:

   ```sh
   git add docs/project-overview.md
   git diff --cached
   git commit -m "docs: clarify MVP scope"
   git push -u origin HEAD
   ```

7. **Open a PR** to `main` in GitHub. Describe purpose, scope, checks, assumptions, remaining problems, and interface impact. Link the task if available.

8. **Review and merge after approval.** A teammate reviews the PR. Follow the integration authorization in [AGENTS.md](../AGENTS.md) and verify approvals, required CI and the final diff before merging. Reduce scope instead of merging incomplete or failing work.

9. **Synchronize local branches** after merge, from a clean working tree:

   ```sh
   git switch main
   git pull --ff-only origin main
   git switch -c feat/your-name-next-task
   ```

   To continue an existing feature branch, fetch and merge `origin/main` into it. Never rewrite shared history. Branch cleanup is optional; verify merged work before deleting branches.

## Safe merge conflicts

Start on a clean task branch and coordinate with affected file owners:

```sh
git fetch origin
git merge origin/main
git status
```

Read both versions and intended behavior. Do not blindly accept an entire side or discard another developer's changes. Ask the owner if intent is unclear. Resolve files, remove conflict markers, stage resolved paths, inspect the staged diff, rerun checks, then complete the merge with `git commit`.

To cancel an in-progress merge, use `git merge --abort`. If it cannot abort, stop and preserve files before further recovery. Never use force push, `git reset --hard`, or `git clean` to resolve conflicts.

## Worktrees for parallel agents

Give each independent agent a task, branch, and worktree. From the clone:

```sh
git fetch origin
git worktree add -b feat/alex-ui ../lindberg-alex-ui origin/main
git worktree list
```

Start the agent in `../lindberg-alex-ui` with precise file boundaries. Another agent needs another directory and branch. Worktrees share history/remotes but have separate files and staging areas. Do not check out one branch in two worktrees or assign independent agents to the same working tree.

Before removing a finished worktree, verify its commits are safely pushed/merged, its status is clean, and it contains no needed untracked or ignored files such as local configuration. Never force removal:

```sh
git -C ../lindberg-alex-ui status
git worktree remove ../lindberg-alex-ui
```

Use the environment's managed worktree tool instead for worktrees managed by that environment.

## Avoid overlapping tasks

- Record human owner, branch/worktree, files, and dependencies for active tasks.
- Split by component or feature with agreed boundaries. Directory separation alone does not ensure independent interfaces.
- Assign one coordinator for contracts, lockfiles, configuration, and shared docs.
- Approve contracts before dependent work starts, then notify affected owners.
- Integrate small changes frequently. Ask the owner before editing their files.

## Recover from problematic changes

- **Uncommitted work:** stop the agent, inspect status/diffs, and preserve changed/untracked files in a local backup outside the repo before recovery. Keep secrets local. Do not overwrite another developer's work.
- **Committed changes:** identify the exact commit with `git log --oneline`. On a new fix branch from updated `main`, use `git revert <commit-sha>` for an ordinary commit, review, test, and open a PR. Coordinate overlapping later changes. Merge commits require separate review of parent selection; do not guess.
- **Lost commit reference:** inspect `git reflog`; after identifying the commit, preserve it with `git branch recovery/your-name <commit-sha>`. Reflog is local and does not back up uncommitted files.
- **Exposed credential:** notify its owner and revoke/rotate immediately. A later deletion does not remove it from history; coordinate cleanup without an agent force pushing.

Never rewrite shared history or automatically discard work as a recovery shortcut.

## Keep main ready

Keep `main` valid at the current stage and deployable once runnable. Use small PRs, teammate approval, relevant checks, and agreed interfaces. Configure GitHub protection to require PR review and block force pushes; add required checks after CI activation. Keep setup docs current and reserve time for an end-to-end demo rehearsal.

## Continuous integration

See [Code quality workflow](../.github/workflows/README.md) for the checks run on pushes and pull requests.
