# Dakly docs

This folder is the single source of truth for building Dakly. If a doc here and an older doc outside the repo disagree, this folder wins, and the older doc should be fixed or marked out of date.

| Folder                                         | What it holds                                                                          | Read it when                                    |
| ---------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------- |
| [product/](product/)                           | What Dakly is, release scope, glossary and metrics, decisions, data model, competitors | You are new, or a product question comes up     |
| [features/](features/)                         | One file per feature: behaviour, rules, screens, status                                | Before you build or change a feature            |
| [design/](design/)                             | Prototype screenshots, prototype review, theme tokens                                  | Before you build a screen                       |
| [development/](development/)                   | How to build a feature, step by step, and the release 1 order                          | Before you start a task                         |
| [plans/](plans/core.md)                        | Task-by-task build plans for the current milestones, with assumed decisions            | Before you pick up a task                       |
| [rules/](rules/)                               | Coding rules, one file per topic, each with wrong and right code                       | Before you write code in an area                |
| [data/](data/README.md)                        | Release 1 tables, ER diagram, RLS, state machines, jobs, API routes                    | Before you write a repository, job or route     |
| [adr/](adr/)                                   | Architecture decisions already made                                                    | Before you propose a change to the foundation   |
| [architecture.md](architecture.md)             | How the pieces fit, queues, key flows, operations                                      | First day                                       |
| [scale-and-security.md](scale-and-security.md) | Capacity targets, performance budgets, security standards                              | Before you design a table, a job or an endpoint |
| [tasks.md](tasks.md)                           | Every release 1 task with its status                                                   | Picking up work, and when a PR merges           |

## Development readiness review

The [readiness review](reviews/development-readiness.md) records feature coverage, verified checks, contradictions and acceptance criteria to resolve before implementation. Follow-up work is tracked in [tasks.md](tasks.md#readiness-review-follow-up).

## Keeping the docs right

- A PR that changes behaviour updates the feature doc in the same PR. A reviewer rejects a behaviour change with a stale doc.
- A PR that finishes or starts a task updates its row in [tasks.md](tasks.md).
- Open questions are listed in [product/open-questions.md](product/open-questions.md). When Asif answers one, move the answer to [product/decisions.md](product/decisions.md) and update the affected feature docs in the same PR.
- Docs follow [rules/writing.md](rules/writing.md): plain words, short sentences, no filler. `pnpm lint:docs` checks the common slips.

## Source documents outside the repo

These were the working drafts. Their content has been moved here: the PRD module tabs are in each feature doc under "Product requirements", the PRD glossary is [product/glossary.md](product/glossary.md), the data model tab is [product/data-model.md](product/data-model.md), the architecture tab is [scale-and-security.md](scale-and-security.md), and the missing designs list is split between [design/prototype-review.md](design/prototype-review.md) and the feature docs. Use the drafts only for history.

- PRD: https://claude.ai/artifact/B24GPU5sw3LtFFwgsbXZzD
- Architecture: https://claude.ai/artifact/7fyrptKfhe9WNvH4pQTsQJ
- Code conventions: https://claude.ai/artifact/HVw1Ud4qcAbrXwKvZ8EiEz
- Release 1 engineering spec: https://claude.ai/artifact/9uVwnWsphUvroZpzWoiMNv
- Schema review (not yet accepted): https://claude.ai/artifact/QVk9UfT8o7vV8bnpjnVRGS
- Design prototype: https://claude.ai/artifact/Bi4AA8D5DFq1ifsUbgt1Su
- Feature analysis of the prototype: https://claude.ai/artifact/LHdrBAJtZnkJcoZTajLgQv
- Plans and add-ons design: https://claude.ai/artifact/Pa8Fe4ED1hAD51kXVjEzXR
