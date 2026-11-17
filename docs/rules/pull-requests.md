# Pull requests

- One purpose per PR, under about 500 changed lines. Split by layer when needed: schema + migration, then service, then UI.
- Branch names say what the branch does: `<type>/<task-id>-<what-it-does>`, lower case, words joined by hyphens, at most 50 characters. The type matches the commit type (`feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`). Example: `feat/acc-3-sessions`, `fix/rev-3-foundation-review-fixes`. Work outside a task drops the id: `fix/order-total-rounding`. Never `codex/...`, `patch-1`, `update`, `wip` or a date; rename such a branch before opening the PR. When a plan in [plans/](../plans/core.md) names the branch, use that name.
- PR titles and commit subjects: `<type>(<task-id>): <summary>`, starting the summary in lower case, such as `feat(acc-7): add staff roles`. The scope is optional for work outside a task: `fix: round order totals`.
- `pnpm check` passes locally before you push.
- Review your own diff before you open the PR. Run `pnpm check`, `pnpm test:int` and `pnpm test:e2e`, then review the diff in a fresh context (`/code-review` and `/security-review`, or a new agent that has not seen the work) against these rules, and fix what it finds. The reviewer should find nothing the author could have found.
- The author has read every line of the diff, including AI-written lines.
- The PR names its task id from [tasks.md](../tasks.md), updates that row, and updates the feature doc when behaviour changes.
- Fix small issues in the same PR. "Follow-up PR" for a rename usually never happens.

## Checks

The `pr-rules` job runs `scripts/check-pull-request.mjs` on every pull request. It fails when:

- The branch name does not match `^(feat|fix|refactor|perf|docs|test|chore)/[a-z0-9]+(-[a-z0-9]+)*$` or is over 50 characters.
- The PR title or a commit subject does not match `^(feat|fix|refactor|perf|docs|test|chore)(\([a-z0-9-]+\))?: [a-z].+`. Merge commits from updating the branch are skipped.
- The PR changes more than 800 lines.

Changed lines are added plus deleted lines from `git diff --numstat base...head`, not counting `pnpm-lock.yaml`, `docs/`, Markdown files, `*.spec.ts`, `*.spec.tsx`, `test/` folders, `apps/web/e2e/`, `packages/db/migrations/meta/` and `.sql` files in `packages/db/migrations/`. Over 500 lines prints a warning. A PR labelled `mechanical-change` only gets the warning above 800 lines; use the label only for changes made entirely by a formatter or autofix.

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
