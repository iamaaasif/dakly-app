# Frontend polish rules

For the developer who polishes the design and UI/UX of the web apps, and for the AI coding tool they use. Read this file before you start. If a rule here and your tool's habits differ, this file wins.

## Your job

Make the screens match the design and feel right to use. That means layout, spacing, type, colour tokens, states (empty, loading, error), responsive behaviour, copy, small flow fixes and accessibility.

It does not mean new features, new business rules or new data. If a screen needs something the backend does not give yet, follow [When you need a backend change](#when-you-need-a-backend-change).

## One branch only

- All your work goes on one long-lived branch: `feat/web-polish-frontend`. Create it from `main` once.
- Do not create other branches. Do not open one PR per screen.
- Keep one draft PR open from that branch to `main`, titled `feat: polish frontend design and flows`. Mark it ready only when the reviewer asks.
- Merge `main` into the branch at least every day you work, so conflicts stay small. Use a merge commit.
- Never rebase, amend, squash or force-push the branch. Never push to `main`. Fixes go in new commits.

## What you may change

- `apps/web/src/` and `apps/admin/src/`: pages, components, hooks that only shape the view.
- `packages/ui/`: shared components and `theme.css`, when the change is visual. Keep the component API stable, or update every caller in the same commit.
- `apps/web/e2e/` and `*.spec.tsx` next to the code you change.
- `docs/design/evidence/` for screenshots, the UI sections of `docs/features/`, and `docs/development/frontend-polish-backend-todo.md`.

## What you must not touch

Do not edit these paths for any reason:

| Path                                                                          | What it is                                     |
| ----------------------------------------------------------------------------- | ---------------------------------------------- |
| `apps/api/`                                                                   | Backend API                                    |
| `apps/worker/`                                                                | Background jobs                                |
| `packages/core/`                                                              | Business rules and services                    |
| `packages/db/`                                                                | Schema, migrations, row level security         |
| `packages/contracts/`                                                         | API request and response shapes                |
| `packages/providers/`                                                         | Vendor drivers (Meta, bKash, SMS, AI and more) |
| `.github/`                                                                    | CI, PR template, code owners                   |
| `scripts/`                                                                    | Check and test scripts                         |
| `docker-compose.yml`, `turbo.json`                                            | Infrastructure and build setup                 |
| `eslint.config.mjs`, `knip.json`, `tsconfig.base.json`, `pnpm-workspace.yaml` | Repo-wide config                               |
| `docs/adr/`, `docs/rules/`, `CLAUDE.md`                                       | Decisions and rules                            |

Also:

- Do not add or upgrade a dependency without asking the reviewer first. `pnpm-lock.yaml` should not change.
- Do not change what a request sends or what a response means. Read types from `packages/contracts`; never edit them.
- Do not touch anything about the AI agent: prompts, tools, models, replies.
- Do not change how the app reads the store or the session. No store id from the URL, a form or a header.

If your tool wants to edit a path above, stop and add a backend note instead.

## When you need a backend change

You do not make it. Instead:

1. Add an entry to `docs/development/frontend-polish-backend-todo.md` with the screen, what is missing, why the screen needs it, and the API shape you expect (method, path, request and response fields).
2. Add a `// TODO(backend): <short reason>` comment at the place in the code, if one exists.
3. Work around it with the APIs that exist today, or leave the UI ready: render the state with what you have, and do not fake data that looks real.

The reviewer reads that file after you finish, makes the changes that are really needed in separate PRs, and tells you which ones they declined.

## Match the design

- Source of truth: the design images in `docs/design/screenshots/`, the images in the project files for the task, and [theme.md](../design/theme.md). The feature doc in `docs/features/` wins over the image for behaviour, numbers and scope; see [design/README.md](../design/README.md).
- Every screen must match its design image element by element at 360 px and 1440 px width: same elements, same order, same states, copy from the feature doc. Check each field, button, label, empty state and error state, not only the overall look.
- Use tokens only. No hex, rgb or hsl values, no arbitrary values for colour or font size, no inline money formatting. See [frontend-styling.md](../rules/frontend-styling.md).
- Reuse components from `packages/ui` and `apps/web/src/components/` before you write one. Search first.
- Bangla text must render and wrap well. See [frontend-accessibility.md](../rules/frontend-accessibility.md).
- Read the rules for the area you touch: [frontend.md](../rules/frontend.md), [components](../rules/frontend-components.md), [styling](../rules/frontend-styling.md), [data and state](../rules/frontend-data-and-state.md), [forms](../rules/frontend-forms.md), [accessibility](../rules/frontend-accessibility.md), [writing.md](../rules/writing.md).

### Screenshot evidence

For each screen you change, put two screenshots in `docs/design/evidence/<screen-name>/`, for example `docs/design/evidence/orders-list/orders-list-360.png` and `orders-list-1440.png`. Include one for each important state you changed. Follow the layout of the folders already there. In the PR description, add one line per screen that says which design image it matches and lists anything that differs on purpose, with the reason.

## Commits and the PR

The `pr-rules` check enforces the first two items on every commit.

- Commit subject: `<type>(<scope>): <summary>`, with the summary starting in lower case. Types are `feat`, `fix`, `refactor`, `perf`, `docs`, `test` and `chore`. Use `style` changes as `fix` or `refactor`. Example: `fix(web): align orders table header on phones`.
- Scope is optional. Use a task id such as `cus-4` when the work belongs to one task in `docs/tasks.md`, or the screen name such as `orders`.
- Small commits: one screen or one fix each. Keep the history complete; do not squash it yourself.
- No AI signatures anywhere: no `Co-Authored-By` trailer for an AI tool, no "Generated with" line, no tool names in commits, PR bodies, PR comments or code comments. Check your tool's settings, because some add these lines by default, and remove them before you push.
- Use your own name and email as author. Do not use a tool's identity.
- Docs, comments and UI copy use plain words: no filler, no emoji ([writing.md](../rules/writing.md)).

## Before you push

Run these from the repo root and fix what they report:

```bash
pnpm check
pnpm test:e2e   # when you touched apps/web
```

Then review your own diff in a fresh context against these rules. Run `git diff --stat origin/main` and confirm that no path from the "must not touch" table appears.

## Size of the PR

The `pr-rules` check fails a PR that changes more than 1,000 lines outside docs and tests. A branch that holds all polish work will pass that line. This is expected. Leave the check as it is and do not split the branch yourself; the reviewer decides how to land it.

## Handover

1. Tell the reviewer the branch is done and make sure the draft PR description lists each screen with its evidence line.
2. Make sure `docs/development/frontend-polish-backend-todo.md` lists every backend need you found.
3. The reviewer reviews the branch, asks for changes as review comments, and fixes small items (copy, formatting, notes) themselves with new commits. Pull before you push again and keep those commits.
4. The reviewer makes any backend changes that are really needed in separate PRs, then lands your branch.
