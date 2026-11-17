# Handoff: Dakly run, CUS-1 to CAMP-6

You are taking over an unattended build of the tasks in `docs/plans/customers-to-automations.md` in `iamaaasif/dakly-app`. The owner is Asif. Read this whole file, then `CLAUDE.md`, `docs/rules/` (every file, they are short), `docs/rules/pull-requests.md` and `docs/tasks.md` before you touch anything.

State as of 17 Nov 2026, about 15:45 UTC. Main is `53207e6` and its last migration is `0032`.

## Binding rules

### Owner rules

**Pull requests**
- One PR per task. Split a task over about 500 changed production lines. CI's pr-rules job fails anything over 800 (`scripts/check-pull-request.mjs`, `countChangedLines`).
- Never raise the 800-line limit and never use the `mechanical-change` label to dodge it. Each split part needs its own tests and must pass CI alone.
- Never merge, never push to main, never force-push pushed history, never rebase or amend pushed commits. Merge main into a branch with a plain merge commit.
- At most 4 open PRs at once. Stack a PR on another only when it needs exactly one unmerged task.
- PR descriptions follow `.github/pull_request_template.md`. The "I read every line of this diff" box stays unticked. Say why a PR is over 500 lines if it is.
- Update the task row in `docs/tasks.md` (status and PR number) and the feature doc in the same PR.

**Commits**
- Author: `asifwpxpo <asif@wpxpo.com>`.
- Subject: `type(task-id): summary`, lower case, at most 72 characters.
- No AI signature, "Generated with" line, co-author trailer or session link anywhere: not in commits, PR bodies or comments. Strip any footer a tool adds before posting.

**Tests and dependencies**
- Never weaken, skip or delete a test or an assertion. When markup moves, update the selector, never the assertion.
- No new npm package unless the task allows one.

### Before opening a PR (docs/rules/pull-requests.md, #117)
1. Review your own diff.
2. Run `pnpm check`, `pnpm test:int` and `pnpm test:e2e`.
3. Get a fresh-context code and security review of the diff against `docs/rules`, from a reviewer who has not seen the work. Fix everything it finds.
4. An approval covers only the commit that was reviewed. Any push after a review needs a new review, including the conflict resolutions of a merge from main. Say in a PR comment what changed.
5. A PR with an unanswered question does not merge.

### Screens
For every PR that adds or changes a screen:
- **Match the design.** Match the layout of the matching image in `docs/design/screenshots/`. `docs/design/theme.md` wins on exact styles, and the feature doc wins on behaviour.
- **Screenshots in the PR body.** Attach Playwright screenshots at 1440 × 900 and 360 × 800 next to the design image, with one line per screen on what still differs and why.
- **Leave out anything without a backend.** Never draw a dead button.

Screenshots for #123 live on the orphan branch `assets/web-7-screenshots`. Link them as `https://github.com/iamaaasif/dakly-app/blob/assets/web-7-screenshots/<dir>/<file>.png?raw=true`.

### Migration clash
Each stack below has its own unmerged migrations, and they share numbers: 0033 and up on each stack. After the first stack merges, merge main into the next one, delete that branch's own unmerged migration files and their meta snapshots, and rerun `pnpm --filter @dakly/db db:generate` on the lowest branch of the stack.

Never rename a migration by hand, and never touch a migration already on main. Some of the stack migrations contain hand-written SQL (functions, backfills, RLS policies). Copy that SQL into the regenerated file; do not lose it.

## Local setup

```bash
pnpm install
docker compose up -d postgres valkey mailpit
pnpm build
DATABASE_ADMIN_URL=... pnpm --filter @dakly/db db:migrate
pnpm check
pnpm test:int        # needs DATABASE_URL and DATABASE_ADMIN_URL
pnpm test:e2e
```

- **Storage:** CUS-8's file upload tests need an S3 stand-in. Run SeaweedFS from `docker-compose.yml` (service `seaweedfs`, S3 on :8333).
- **Isolation:** if you run several worktrees at once, give each its own database and Valkey db number. Run `test:int` and `test:e2e` one at a time.

## Where every task stands

All branches below are pushed. No PR is open for any of them yet.

| Task | Branch (in stack order) | Lines | State |
|---|---|---|---|
| CUS-8 import, part 2a | `feat/cus-8-import-upload` | 589 | Second review's findings to fix |
| CUS-8 part 2b-1 | `feat/cus-8-import-reader` | 383 | Same as 2a |
| CUS-8 part 2b-2 | `feat/cus-8-import-job` | 553 | Same as 2a |
| CUS-8 part 3 | `feat/cus-8-import-undo` | 197 | Same as 2a |
| CAMP-5 runner, part 1 | `feat/camp-5-automation-runner` | 458 | Approved by the second review. Its main merge since then needs review. |
| CAMP-5 part 2 | `feat/camp-5-automation-steps` | 411 | Same as part 1 |
| CAMP-5 part 3a | `feat/camp-5-automation-send-costs` | 485 | Split just finished; checks not run on the new tips |
| CAMP-5 part 3b | `feat/camp-5-automation-send-retries` | 506 | Same as 3a |
| CAMP-5 part 4 | `feat/camp-5-automation-balance-pause` | 429 | Same as 3a; holds the second review's fixes |
| CAMP-3, part 1 | `feat/camp-3-campaign-queue` | 149 | Review fixes in progress |
| CAMP-3, part 2 | `feat/camp-3-campaign-sender` | 668 | Same as part 1 |
| CAMP-3, part 3 | `feat/camp-3-campaign-results` | 326 | Same as part 1 |
| CAMP-3 WIP | `wip/camp-3-review-fixes` | 41 | Uncommitted fix work, not checked. Never open a PR from it. |
| WEB-7 | merged as #123 (part 1, app frame) | n/a | Stays In progress; each screen PR matches its image |
| CAMP-4, CAMP-11, CAMP-12, CAMP-6 | not started | n/a | See "Remaining tasks" |

"Lines" is the pr-rules count for each branch against the branch above it, or against main for the first. All three stacks already contain main `53207e6`.

`backup/*` branches keep old tips from before a split. They are only there for comparison: never open a PR from one, and delete them when the stacks merge.

### CUS-8 (customer CSV import)

**Fixes already in.** Two fresh reviews ran. Every finding from the first is fixed:
- a crashed run now gets a lease retry, and a sweep re-queues it up to 4 times;
- undo keeps contacts whose consent changed after the import, checked through `ConsentService.currentForAudience`;
- undo now finishes and records `undo_finished_at`;
- the sweep judges from `last_progress_at`;
- UTF-8 is decoded with `fatal` on;
- the WhatsApp fill follows the owner's rule;
- report fields show labels;
- the plan section was restored.

On the tips, `pnpm check` passed on all four, and `test:int` and `test:e2e` passed on the undo tip.

**The second fresh review finished: 1 blocking, 6 should-fix, 6 nits.** Fix all of them, then get a third fresh review of the fix commits.

**Blocking**

1. **Job branch: the import reads another feature's table, and a rule was edited to allow it.** `contacts.repository.ts` `findByPhones` reads the consents table `contact_consent_current`, and merge `ba4fece` edited `docs/rules/module-boundaries.md:39` to permit it. Revert that rule edit. Then, in `ImportsService` inside the batch transaction:
   1. `contacts.findImportMatches(phones)`
   2. `contacts.lockForConsent(ids)` (in id order)
   3. `consents.currentForAudience(ids, 'whatsapp')`
   4. pass the set of contacts that have an answer into `saveImportedRows`.

   `ContactsService` can't call `ConsentService` itself, because that would be a dependency cycle.

**Should-fix**

2. **Job branch: the WhatsApp-answer read takes no lock.** Finding 1's lock-then-read order closes this. Also lock rows in id order in `updateImported`, so two imports can't deadlock.
3. **Reader branch: the sweep can fail a live import.** `requeue` also returns false when the import is no longer stalled, and two sweeps can overlap. Fail an import only in one guarded update: stalled, `requeue_count >= limit` and `claimed_at IS NOT DISTINCT FROM lease`. Don't leave an orphan report object when that update matches nothing.
4. **Reader branch: NUL and C0 control bytes break a batch.** They are valid UTF-8 and pass the decoder, but Postgres rejects `\u0000`, so the batch fails on every retry. `decodeCustomerImportFile` must reject NUL and C0 controls other than tab, CR and LF with `IMPORT_FILE_UNREADABLE`. Add a test for UTF-16 with no BOM.
5. **Undo branch: an undo whose job failed is finished only by the shop clicking again, which is refused after day 7.** The sweep must re-queue `undone` imports where `undo_finished_at` is null, with no 7-day cutoff once the undo was accepted. Add `undoFinishedAt` (or an "undoing" state) to `ImportResponse`.
6. **Undo branch, owner question: should undo cancel the consents the import granted to existing contacts?** Today undo removes only the contacts the import created. Grants it gave to existing contacts stay. Ask the owner whether undo should record an "import undone" answer for those grants. In any case, state the behaviour in feature 03 and `docs/product/open-questions.md`.
7. **Job branch, owner question: a WhatsApp grant can attach to a number the file never named.** When an existing contact's saved WhatsApp number differs from the file and is kept, the import still grants WhatsApp consent, so the grant lands on the saved number. Proposed: skip that grant and report it on the row. Confirm with the owner first, since it is close to D42.

**Process and nits**

8. **The job branch's review fixes are inside merge commit `ba4fece`.** It holds the lease throw, finished-after-write, the WhatsApp rule, labels and the rule edit. The undo merges `be5a3b2` and `919c548` are the same. These are pushed, so do not rewrite them. List them in the PR bodies so reviewers check them, and put future fixes in normal `fix(cus-8): ...` commits.
9. **Job branch, feature 03 lines 148-150.** After a crash every retry fails, because the lease (5 min) outlasts the retries (about 90 s). Recovery comes from the sweep after 15 minutes. Say so.
10. **Undo branch, `packages/db/src/schema/imports.ts:56-59`.** The comment sits above the wrong column.
11. **Upload and undo branches, `docs/data/state-machines.md:151`.** Spell out `done` or `failed` → `undone` within 7 days, finished when `undo_finished_at` is set.
12. **Job branch, `saveImportedRows`.** Pass the import's actor (services.md rule 2).
13. **Job branch, `contacts.repository.ts:288`.** Drop the duplicated `coalesce(contacts.whatsapp_phone, ...)` rule, or say why it is a second guard.
14. **Undo branch.** A repeated POST undo publishes a bulk job each time. Rate-limit it, or skip publishing when one is pending.
15. **Undo branch, later tasks.** Orders, chats, identities and merges must bump `contacts.updated_at`, or undo must check them. Add this to `docs/product/open-questions.md` or the ORD and CHAT task notes.

`contacts.repository.ts` is at the 400-line lint limit, so split it before adding to it.

**Then open 4 stacked PRs.** Each PR body says:
- 0033 has a unique-index line that was moved above the FK by hand, and the migration is not yet on main;
- `CONCURRENTLY` and `NOT VALID` are not used, because there is no data before beta;
- chats and orders do not change `contacts.updated_at`, so undo can remove a contact who has since gained a chat or an order (feature 03 says so).

### CAMP-5 runner

Part 3 was split into `send-costs` (3a) and `send-retries` (3b) on the owner's instruction. Part 4 was rebuilt on 3b. Against the old part 4 tip (`backup/camp-5-balance-pause-6ac024a`), the code is identical; only docs changed and the migrations were split (0035, 0036 and 0037 for parts 3a, 3b and 4).

**To do:**
1. Run `pnpm check`, `test:int` and `test:e2e` on each of the five tips, on fresh databases.
2. Get a fresh review of three things:
   - the main merge on part 1 (`b4f07d9`) and its merge-up;
   - the split;
   - part 4's fix commit, the one that times a balance pause after the wallet lock and emails every owner past an unsent claim.

   The second review approved parts 1 to 3. Part 4 fixes it asked for:
   - a short claim of about 20 s, in-flight sending;
   - the loop moves on past an owner who has a claim;
   - `clock_timestamp()` for the pause;
   - the `docs/data/jobs.md` row;
   - the duplicate-email sentence;
   - a `!` assertion removed.

   Verify each of these is in.
3. Open the PRs. Each body says the parts must merge in order, and that 3a, 3b and 4 merge back to back with no deploy in between. Before part 4, a short balance skips the message, which the owner rejected. Part 4 pauses the workflow instead.

### CAMP-3 campaign sending

The owner's answers (17 Nov) are in the brief below. What is done and what is left:
- **Committed on the branches:**
  - an index for the sweep;
  - a `started_at` backfill;
  - the SMS refusal turned into a core error;
  - a check that the approved number is checked first;
  - never resend after a withdrawal or block;
  - a cap on provider calls.
- **Uncommitted at cutoff, now on `wip/camp-3-review-fixes`:** the part 3 changes (index, 0034 regeneration, `markSettled`, cancel rules). Unfinished and unchecked. Fold it into the right branches by hand, then check it.

**Second review list, in full.** Verify each item, because you can't tell from here which are done:
1. A resend after an expired claim defers for quiet hours.
2. A retry ceiling on resends.
3. An `AppError` raised on a resend never re-queues the recipient.
4. 0033 backfills `started_at`.
5. Partial indexes on `(store_id, started_at, id)`.
6. `markSettled` returns whether it stamped, and callers use it.
7. One messaging error type, instead of importing `SmsSendRefused` into core.
8. The `send_attempts` comment says why, not what.
9. The CAMP-3 plan line is fixed.
10. The isolation-and-access wording on part 1 is fixed.
11. Rename the test that asserted mock calls, so it checks behaviour.
12. The PR body maps each old test to its new one.

**Plus the owner's two rules:**
- **Expired-claim resend.**
  - If consent was withdrawn, the contact was blocked or the campaign was cancelled, never resend. Mark the recipient failed with an unknown outcome and keep the charge.
  - When the provider message id is known, check with the provider: charge if it was sent, release if not, never resend.
  - Hitting the retry ceiling is handled the same way.
- **Cancel up to the send time.** There is no 5-minute cutoff. During sending, cancel stops the remaining sends, and claimed messages are settled by the sweep, never resent. `CAMPAIGN_NOT_CANCELLABLE` applies only to a finished or already cancelled campaign.

**Must match CAMP-5:** `MessagingService.send` takes `destination?: string | null`. It refuses with `MESSAGING_DESTINATION_CHANGED` (409) when a destination is given and differs from `contact.phone`, null included. This check runs before the no-phone check. Keep the two stacks' versions of this code identical.

**Then:** run the checks, get a third fresh review, and open 3 stacked PRs.

## Owner decisions to keep

**Campaigns (CAMP-2)**
- `checkAudience` pages hold 500 contacts. SMS credits are reserved; poisha stays 0.
- Approval is a toggle, on by default, with one approve route.
- The audience cap is 20,000 (`CAMPAIGN_AUDIENCE_TOO_LARGE`), tracked as task CAMP-13.
- Only a manual pause can be resumed (`CAMPAIGN_PAUSED_BY_SYSTEM`). Cancel sets `finished_at`. Cancelling a paused campaign clears `pause_reason` and releases only the uncharged part.

**Workflows with a short balance**
- **Pausing.** A short balance pauses the workflow with `pause_reason = balance`. Runs wait at their send step, and new trigger events still enter and wait.
- **Telling the owner.** The owner gets an in-app card plus an email at once. The top-up link points to `/settings` until PAY-8; the PAY-8 row in tasks.md has a note.
- **Resuming.**
  - A top-up resumes the workflow automatically; it can't be resumed by hand.
  - On resume, waiting sends under 24 hours old go out. Older ones are skipped as `no_credits`, and the step's "if not reachable" then applies.
  - CAMP-11 must create runs while a workflow is paused for balance.
  - Any top-up resumes every balance pause, even one too small to cover it. A released reservation does not resume one.

**CUS-8 (imports)**
- An import emits no `contact.created`. It still publishes `consent.changed` with source `import`. CAMP-11's `consent_given` trigger ignores source `import`, with no setting to turn that off.
- An empty WhatsApp number is filled only when the contact has no WhatsApp consent answer. Otherwise the row report says "WhatsApp number differs, not changed" (D42).
- Files are capped at 10 MB and 50,000 rows and read whole (see `docs/scale.md`). The 10 MB limit is enforced in the signed URL and again before parsing.
- The R2 lifecycle rule (delete `imports/` after 7 days) is on the "Open for Asif before beta" list in `architecture.md`.

**Process**
- CAMP-5 part 3 must be split. CI's line limit is never raised.

## Remaining tasks after the three stacks

| Task | Waits on | Notes |
|---|---|---|
| CAMP-4 | CAMP-3 merged | Campaign screens. Must match `campaigns.webp`. |
| CAMP-11 | CAMP-5 merged | Workflow triggers. `consent_given` ignores source `import`. Runs are created while a workflow is paused for balance. |
| CAMP-12 | CAMP-11 | Read its row and feature 09. |
| CAMP-6 | CAMP-12 | Read its row and feature 09. |
| WEB-7 | none | Later screen parts. Each screen PR matches its own image. |

## Things the final report must mention

**Mistakes during the run**
- **#111:** a review comment went unanswered for about two hours, because I compared the PR's updated time instead of comment ids. Always compare by the last seen comment id.
- **#109:** a fix was pushed before `pnpm check` passed. The failure was a known argon2 timeout under load, and a rerun passed.

**Flaky tests and test changes**
- The CUS-6 test "counts 50,000 contacts in under 2 seconds" fails under load and passes when run alone.
- `invite-entry.spec.tsx` once hit its 5 s timeout under load.
- The #111 builder test got a 15 s per-test timeout. No assertion changed.

**Out of scope, noted for later**
- ACC-14 reconciliation gap: when a first try is refused and the claim is then lost, the row stays `sending` and its credits stay reserved until reconciliation.
- Tag actions record no audit entry and emit no `contact.tag_added` yet.
