# Pull requests

- One purpose per PR, under about 800 changed lines (1,000 at most). Split by layer when needed: schema + migration, then service, then UI.
- Branch names say what the branch does: `<type>/<task-id>-<what-it-does>`, lower case, words joined by hyphens, at most 50 characters. The type matches the commit type (`feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`). Example: `feat/acc-3-sessions`, `fix/rev-3-foundation-review-fixes`. Work outside a task drops the id: `fix/order-total-rounding`. Never `codex/...`, `patch-1`, `update`, `wip` or a date; rename such a branch before opening the PR. When a plan in [plans/](../plans/core.md) names the branch, use that name.
- PR titles and commit subjects: `<type>(<task-id>): <summary>`, starting the summary in lower case, such as `feat(acc-7): add staff roles`. The scope is optional for work outside a task: `fix: round order totals`.
- Review your own diff before you open the PR. Run `pnpm check`, `pnpm test:int`, and `pnpm test:e2e` when the change touches `apps/web` or sign-in, then review the diff in a fresh context (`/code-review` and `/security-review`, or a new agent that has not seen the work) against these rules, and fix what it finds. The reviewer should find nothing the author could have found.
- The author has read every line of the diff, including AI-written lines.
- The PR names its task id from [tasks.md](../tasks.md), updates that row, and updates the feature doc when behaviour changes.
- Fix small issues in the same PR. "Follow-up PR" for a rename usually never happens.

## Tests while you work

The full suites are slow, and CI runs all of them on every push, so run them once per PR, not once per commit.

- While writing code, run the tests for what you changed: `pnpm --filter <package> test <path>` for unit tests, and `pnpm --filter <package> test:int <path>` for the Postgres tests of that feature.
- Before you open the PR, run the full set and the fresh-context review described above.
- After review comments, run `pnpm check` and the tests for the files you changed, then push. CI runs `pnpm test:int` and `pnpm test:e2e`, and nothing merges until it is green. Repeat the fresh-context review only when the fix changes logic, not for renames, comments or docs.
- After you merge `main` into your branch, check only what the merge changed. When it resolved conflicts in docs alone, such as `docs/tasks.md`, run `pnpm exec prettier --check <files>` and `pnpm lint:docs`. When it touched code, run `pnpm check`.
- A test that fails at random is a bug: fix it in its own PR without weakening an assertion or a timeout. Never rerun the full suite to get past one.

## While a PR waits for review

- Do not end your session while you have an open PR or an unfinished task. A status report is not a reason to stop.
- When nothing else can move, wait in a loop: every 5 minutes, list your open PRs (`gh pr list --author @me --state open`) and read the comments and review comments posted since your last check, including on your PRs merged in the last day. Use `sleep 300` between checks.
- A review comment that asks for a change is a decision, not an open question. Make the change; do not wait for anyone to confirm it. If you disagree, reply once with the reason, then follow the reviewer's answer.
- The reviewer fixes small items itself with new commits on your branch: copy, formatting, task rows and evidence notes. Pull before you push again, and keep those commits. Defects in behaviour, data or design still come back to you as review comments.
- Never rewrite a pushed branch: no rebase, amend or force-push. Fixes go in new commits, and `main` comes in as a merge commit, so the reviewer can read only what changed since the last review.
- When `main` moves and your PR conflicts, merge `main` at once. GitHub runs no CI on a PR with conflicts. When the PR your branch is stacked on merges, merge `main` and retarget your PR to `main` in the same step.
- While one PR waits, work on the next task that does not depend on it, within the open-PR limit your task sets.
- Stop only when every assigned task is merged, or when you reach a usage or context limit. Then post the report your task asks for.

## Checks

The `pr-rules` job runs `scripts/check-pull-request.mjs` on every pull request. It fails when:

- The branch name does not match `^(feat|fix|refactor|perf|docs|test|chore)/[a-z0-9]+(-[a-z0-9]+)*$` or is over 50 characters.
- The PR title or a commit subject does not match `^(feat|fix|refactor|perf|docs|test|chore)(\([a-z0-9-]+\))?: [a-z].+`. Merge commits from updating the branch are skipped.
- The PR changes more than 1,000 lines.

Changed lines are added plus deleted lines from `git diff --numstat base...head`, not counting `pnpm-lock.yaml`, `docs/`, Markdown files, `*.spec.ts`, `*.spec.tsx`, `test/` folders, `apps/web/e2e/`, `packages/db/migrations/meta/` and `.sql` files in `packages/db/migrations/`. Over 800 lines prints a warning. A PR labelled `mechanical-change` only gets the warning above 1,000 lines; use the label only for changes made entirely by a formatter or autofix.

Reviewers reject a PR that:

- Puts business rules in a controller, job handler or repository.
- Reads another feature's repository or table.
- Adds a table with shop data and no RLS policy, or a repository without the cross-store test.
- Reads a store id from the request instead of the session.
- Logs secrets, tokens, phone numbers or message text.
- Adds an abstraction, option or dependency the task does not need.
- Changes an applied migration.
- Changes behaviour without updating the feature doc.
- Has filler, emoji or tool banners in docs, comments or copy ([writing.md](writing.md)).

An approval covers the commit that was reviewed. Any commit pushed after it needs its own review before the PR merges; for a merge from `main`, review the conflict resolutions. Before merging, reread the PR body and comments: a PR with an unanswered question does not merge.

Reviews are direct. "This could be clearer, but fine" is how a codebase decays; ask for the change.
