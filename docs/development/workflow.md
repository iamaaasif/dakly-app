# How to build a feature

Build each feature as a vertical slice, contract first, backend before frontend, in small PRs. This is the order every task in [tasks.md](../tasks.md) follows.

## Why this order

- **Contract first.** The zod schema in `packages/contracts` is shared by the API and the web form. Writing it first fixes the shape both sides build against, so the backend and frontend can be built by different people (or sessions) without guessing.
- **Backend before frontend.** Rules, permissions and store isolation live in the service and the database. A screen built first tends to grow its own rules, which then disagree with the API.
- **Vertical slices, not layers across the app.** "Confirm an order" end to end (contract, table, service, route, button) ships value and gets reviewed as one idea. "All repositories for release 1" does not.
- **Small PRs.** Under about 500 changed lines, one purpose ([pull-requests.md](../rules/pull-requests.md)). A slice usually takes two to four PRs.

This is the same approach as Cal.com and Twenty (contract or API types shared with the web app) and Google's guidance on small CLs.

## Steps for one slice

Before you start: read the feature doc, check [open-questions.md](../product/open-questions.md) for anything that blocks the slice, set the task to `In progress` in [tasks.md](../tasks.md), and read the rule files for the layers you will touch.

| #   | Step                  | Where                                                          | Done when                                                                                   |
| --- | --------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | Contract              | `packages/contracts/src/<feature>.ts`                          | Request schemas, response types and error codes exist and have unit tests for tricky fields |
| 2   | Schema and migration  | `packages/db/src/schema/<feature>.ts`, generated migration     | Table has `store_id`, RLS policy, indexes; migration runs on a fresh database               |
| 3   | Repository            | `packages/core/src/<feature>/<feature>.repository.ts`          | Integration test passes, including the cross-store test                                     |
| 4   | Service               | `<feature>.service.ts`, `<feature>.errors.ts`                  | Unit tests cover every rule in the feature doc and every error code                         |
| 5   | Controller and module | `<feature>.controller.ts`, `<feature>.module.ts`               | Each route has a permission; `app.inject()` test for the happy path and one error           |
| 6   | Jobs and events       | `jobs/`, `<feature>.events.ts`                                 | Handler is idempotent; test runs it twice                                                   |
| 7   | Web: API hooks        | `apps/web/src/features/<feature>/api/`                         | One file per endpoint, typed from contracts                                                 |
| 8   | Web: screen           | `features/<feature>/components/`, `app/(app)/<route>/page.tsx` | Loading, empty, error and data states; works at 360 px; matches the feature doc             |
| 9   | Docs and tracker      | Feature doc, `tasks.md`                                        | Doc matches what was built; task row updated with the PR link                               |

Steps 1 to 5 can be one PR for a small slice. Split as 1–3, 4–6, 7–8 when the diff passes 500 lines. Step 9 is in every PR.

## When the frontend can go first

Only for a screen with no backend yet that Asif needs to see early. Build it against the contract types with a fake API module in the feature's `api/` folder, and replace the fake in the next PR. Never add rules to the frontend to make it work.

## Definition of done

A task is Done when all of these are true:

- [ ] Every rule and edge case in the feature doc for this slice has a test.
- [ ] `pnpm check` passes locally and in CI, and `pnpm test:int` passes.
- [ ] New tables have `store_id`, RLS, and a cross-store test.
- [ ] Every new route has a permission and a zod schema.
- [ ] The screen has all four states and works at 360 px.
- [ ] The feature doc says what the code does, and the task row in `tasks.md` is updated.
- [ ] The author read every line of the diff, including AI-written lines, and removed the signs listed in [simplicity.md](../rules/simplicity.md).
- [ ] Asif or a reviewer approved the PR.

## Working with AI coding tools

- Point the tool at `CLAUDE.md`, the feature doc and the rule files for the area. Ask for one step of the table above at a time.
- Read the diff as if a new hire wrote it. Check imports first (Express, another feature's repository, Drizzle in a service), then names, then comments.
- Run `pnpm check` before you ask for review. Do not raise a lint limit to make AI output pass.
