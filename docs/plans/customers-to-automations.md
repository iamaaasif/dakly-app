# Build plan: customers to automations

How the work from contacts to the workflow builder is split into worker runs, in what order, what runs at the same time, and what needs Asif. The task details (scope, rules, tests) stay in [plumbing-channels-contacts.md](plumbing-channels-contacts.md) and [campaigns-and-automations.md](campaigns-and-automations.md); status lives in [tasks.md](../tasks.md). Delete a group's row once all its tasks are Done.

Decisions: D37 (segments, campaigns and automations are core; the send step is core messaging, the inbox is the Chats extension) and D40 (this work comes before channel connections, with SMS as the first channel) in [decisions.md](../product/decisions.md).

## What a shop can do at the end

After group 8 a shop can add or import customers, record consent, build segments, send approved SMS campaigns with tracked links and a one-tap opt-out, see results, and run SMS workflows built from the template library or on the canvas. Messenger campaigns and Messenger steps come with the channels work once Meta app review is done; WhatsApp waits for Q2; order fields, order triggers and revenue come with Orders.

## Groups

Each group is one worker run: one session with subagents, one PR per task, nothing merged by the worker. A group starts once the groups it needs have merged. Inside a group, tasks with no dependency on each other run in parallel from `main`; a task that needs another task in the same group branches from that task's branch, its PR targets that branch, and stacked PRs merge with merge commits.

| Group | Task    | Branch                                  | Starts from   | Delivers                                                              |
| ----- | ------- | --------------------------------------- | ------------- | --------------------------------------------------------------------- |
| 2     | HOME-1  | `feat/home-1-notifications`             | main          | Notifications per person, streamed live over Server-Sent Events       |
| 2     | PAY-11  | `feat/pay-11-wallet-ledger`             | main          | SMS and WhatsApp wallets: reserve, release, charge; staff credit      |
| 2     | REV-5   | `chore/rev-5-close-lint-gaps`           | main          | The five lint gaps found in REV-5 closed                              |
| 2     | PAY-1   | `feat/pay-1-usage-service`              | HOME-1        | AI allowance meter with 80% and 100% notices                          |
| 2     | HOME-2  | `feat/home-2-notification-bell`         | HOME-1        | Bell and notification list in the shop app                            |
| 3     | CUS-1   | `feat/cus-1-contacts`                   | main          | Contacts replace the customers example                                |
| 3     | WEB-2   | `feat/web-2-ui-components`              | main          | Sheet, menu, tabs, table, toast, tooltip, form fields                 |
| 3     | CUS-2   | `feat/cus-2-consent`                    | CUS-1         | Append-only consent and the current answer per channel                |
| 4     | CUS-5   | `feat/cus-5-customers-web`              | main          | All customers list and profile                                        |
| 4     | CUS-6   | `feat/cus-6-segments`                   | main          | Segment conditions, compiler and counts                               |
| 4     | CUS-8   | `feat/cus-8-customer-import`            | main          | CSV and XLSX import with consent evidence, row errors and undo        |
| 4     | CAMP-8  | `docs/camp-8-workflow-catalogue`        | main          | Workflow graph schema, trigger and action catalogue, templates        |
| 4     | CUS-7   | `feat/cus-7-segments-web`               | CUS-6         | Segments list and builder                                             |
| 5     | MSG-1   | `feat/msg-1-sms-send-step`              | main          | Core send step for SMS                                                |
| 5     | CAMP-9  | `feat/camp-9-send-policy`               | main          | The final send gate                                                   |
| 5     | CAMP-10 | `feat/camp-10-tracked-links`            | main          | Tracked links and the SMS opt-out page                                |
| 5     | CHN-6   | `feat/chn-6-sms-sender`                 | MSG-1         | The shop's own SMS sender name, approved by staff                     |
| 6     | CAMP-2  | `feat/camp-2-campaigns`                 | main          | Campaign drafts, estimate, approval, frozen recipients, reserved cost |
| 6     | CAMP-5  | `feat/camp-5-automation-versions`       | main          | Workflow drafts, publish checks, versions, enable and pause           |
| 6     | CAMP-3  | `feat/camp-3-campaign-sender`           | CAMP-2        | The campaign sender job, cost settlement and result counts            |
| 6     | CAMP-4  | `feat/camp-4-campaign-builder`          | CAMP-2        | Campaign builder screens                                              |
| 6     | CAMP-4  | `feat/camp-4-campaign-list-and-results` | CAMP-3        | Campaign list and results screens                                     |
| 7     | CAMP-5  | `feat/camp-5-automation-runner`         | main          | Runner, part 1 of 5: due runs, claims, step job, waits, splits, exits |
| 7     | CAMP-5  | `feat/camp-5-automation-steps`          | CAMP-5 part 1 | Runner, part 2 of 5: conditions, exit checks, tag actions             |
| 7     | CAMP-5  | `feat/camp-5-automation-send-costs`     | CAMP-5 part 2 | Runner, part 3 of 5: sends, opt-out links, SMS credits                |
| 7     | CAMP-5  | `feat/camp-5-automation-send-retries`   | CAMP-5 part 3 | Runner, part 4 of 5: provider retries and unknown sends               |
| 7     | CAMP-5  | `feat/camp-5-automation-balance-pause`  | CAMP-5 part 4 | Runner, part 5 of 5: pause on a short balance, resume on top-up       |
| 7     | CAMP-11 | `feat/camp-11-automation-triggers`      | CAMP-5 runner | Triggers and entry rules                                              |
| 7     | CAMP-12 | `feat/camp-12-automation-templates`     | CAMP-11       | Automations list, template library and settings forms                 |
| 8     | CAMP-6  | `feat/camp-6-canvas-view`               | main          | Read-only workflow canvas                                             |
| 8     | CAMP-6  | `feat/camp-6-canvas-editing`            | canvas view   | Editing on the canvas                                                 |

Groups 2 and 3 run at the same time. Group 4 needs groups 2 and 3; each later group needs the one before it. Group 8 is small and can join the end of group 7 if CAMP-12 has merged.

Campaign results follow ORD-3, using the feature 09 screen table and "Missing design: campaign results page" section without a separate design (Asif, 18 Nov 2026). Build the list and builder first; sent rows open a read-only builder summary and drafts open the builder. CAMP-4 remains In progress after those screens merge.

## Needed from Asif

Settled on 16 Nov 2026: the frequency cap default follows CAMP-R3 (D41), and an import never changes consent without evidence (D42).

| Item                                                                                                             | Needed by                    |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| SMS provider account (ACC-14) for real sending and delivery receipts. Development and CI use Mailpit until then. | Before beta, not for coding  |
| Short link domain (A4, `dkly.co` in the docs).                                                                   | Before beta, not for coding  |
| Sentry alert rule for `OUTBOX_EVENTS_PARKED` to the staff Slack channel.                                         | Before production            |
| Meta app review and a test Page; WhatsApp BSP (Q2).                                                              | Channels work, after group 8 |

## Questions during a run

A worker that is stuck or unsure asks on its pull request instead of guessing:

1. Open the PR as a draft if it is not open yet.
2. Post one comment that starts with "Question for the reviewer" and gives: what you were doing, the exact question, the options you see with the rule or doc behind each, and your recommendation.
3. Carry on with the parts of the run that do not depend on the answer. Check the PR for a reply before you finish each other task.
4. Follow the answer when it comes. If none has come when the run ends, leave that item out, list it under "Not done" with a link to the question, and never ship your own guess.

The reviewer watches every worker PR and answers on the PR. A product question that changes what Dakly does goes to Asif first; the answer on the PR then says what he decided.

## How each run is reviewed and merged

- The reviewer reads every PR line by line against [CLAUDE.md](../../CLAUDE.md), [rules/](../rules/README.md) and the task's section, fixes small things on the branch or asks the worker, and posts the verdicts to Asif.
- The reviewer merges a PR once the review passes and CI is green (Asif, 16 Nov 2026), and asks Asif only about product decisions. Independent PRs squash; stacked PRs use merge commits, bottom first, then retarget the next PR to `main`.
- Leftovers and out-of-scope findings go into the next group's prompt, not into a PR that is already open.
