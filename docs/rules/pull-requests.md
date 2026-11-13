# Pull requests

- One purpose per PR, under about 500 changed lines (lock files and generated migrations excluded). Split by layer when needed: schema + migration, then service, then UI.
- Branch names say what the branch does: `<type>/<task-id>-<what-it-does>`, lower case, words joined by hyphens, under about 50 characters. The type matches the commit type (`feat`, `fix`, `refactor`, `docs`, `test`, `chore`). Example: `feat/acc-3-sessions`, `fix/rev-3-foundation-review-fixes`. Work outside a task drops the id: `fix/order-total-rounding`. Never `codex/...`, `patch-1`, `update`, `wip` or a date; rename such a branch before opening the PR. When a plan in [plans/](../plans/core.md) names the branch, use that name.
- Commit messages: conventional (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`).
- `pnpm check` passes locally before you push.
- The author has read every line of the diff, including AI-written lines.
- The PR names its task id from [tasks.md](../tasks.md), updates that row, and updates the feature doc when behaviour changes.
- Fix small issues in the same PR. "Follow-up PR" for a rename usually never happens.

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

Reviews are direct. "This could be clearer, but fine" is how a codebase decays; ask for the change.
