# Review of features 01 to 07

Task-mapping findings describe the tracker before this review. The review has added owning rows to [tasks.md](../tasks.md#readiness-review-follow-up), including ORD-9 in M6. Those additions close the missing-row gaps; their implementation, specification and acceptance work remains open. Source line references describe the reviewed baseline.

Reviewed on 13 November 2026. This report covers the full product requirements, engineering sections, acceptance criteria and prototype notes for accounts, channels, customers, chats, products, orders and payments. It also checks the task tracker, decisions, open questions, glossary, data model and shared security rules.

The screenshot links and captions in all seven feature documents were read. The image files were not visually inspected in this specification pass. See the [visual review coverage record](features-08-13.md#screenshot-coverage-record) for the separate image review; the live prototype was not opened. The coverage matrix therefore records documented design and workflow coverage; it does not certify screenshot layout, interaction behaviour or visual completeness.

These are documentation and planning findings. A planned feature that has no implementation yet is not a code defect. Suggested defaults below are proposals for review, not new product decisions. Source line numbers refer to the files as reviewed; the relative links remain useful after lines move.

## Findings that affect security, stock or money

### F01. Closed by product decision

[D25](../product/decisions.md) adds no OTP or separate phone check. Instead it narrows which confirmations verify a phone: a WhatsApp reply from that number, the SMS confirmation link sent to that number, staff confirmation or delivery. A yes in a Messenger or Instagram chat confirms the order but only creates a possible match for staff.

Acceptance: type another contact's phone in Messenger, confirm an order there and ask the AI about past orders. No merge happens, a possible match is shown to staff, and no order of the other contact is revealed. Confirming the same order by WhatsApp reply from that number, by the SMS link, by staff or on delivery merges automatically.

### F02. The common stock guard blocks valid shipping and cancellation

Evidence: [stock implementation](../features/05-products-and-stock.md), lines 124–125, applies `on_hand - reserved >= quantity` to every movement, including release, ship, return, adjustment and import. [Order transitions](../features/06-orders-and-delivery.md), lines 239–245, require reservation on creation and deduction on shipping.

With one unit on hand and one reserved, available stock is zero. The stated guard rejects shipping that reserved unit and releasing its reservation.

Proposed default: define a separate arithmetic rule and guard for every movement kind. Reserving checks available stock; shipping checks the order's reservation and on-hand stock; releasing checks the reservation. Returns and imports increase stock. Adjustments cannot invalidate existing reservations. Each movement reference is applied once.

Acceptance: reserve the last unit, then ship it successfully; reserve then cancel; return an item when available stock is zero; repeat each event without changing stock twice; race two reservations and allow only one. A failed order transaction leaves no reservation or movement behind.

### F03. Reservation start, expiry and reacquisition are not one contract

Evidence: [chat ordering](../features/04-chats-and-ai-agent.md), line 77, reserves on confirmation; line 102 reserves the last unit for 30 minutes when a draft is sent. [Product stock](../features/05-products-and-stock.md), lines 44–45, and [order creation](../features/06-orders-and-delivery.md), lines 239 and 256, reserve every To confirm order. On hold has no stock effect at line 240. No reservation-expiry transition is defined.

The alternatives produce different stock availability. A public order could hold stock indefinitely, or an order could be confirmed after its undocumented reservation expired.

Decision needed: choose reservation start, duration, expiry, hold behaviour and late-payment handling. Proposed default: use explicit reservation records with expiry for unconfirmed drafts, keep confirmed reservations until fulfilment or cancellation, and require stock reacquisition after expiry.

Acceptance: abandon a public order; confirm after expiry; pay after expiry; place an order on hold; edit a reserved variant; race expiry with confirmation. Stock never becomes negative, no reservation is released twice, and a paid order that cannot reacquire stock requires staff action.

### F04. Late successful payments do not fit the intent state machine

Evidence: [payment states](../features/07-payments-and-billing.md), lines 104 and 326, describe forward-only states ending in failed, cancelled or expired. Lines 169 and 333 reconcile pending intents only. Line 181 voids old links after edits, while line 205 permits order changes after a link was sent. `needs_review`, required at lines 182 and 349, is missing from the state list.

A gateway payment can already be in progress when a link expires, is voided or its order changes. The documents do not say how to retain and reconcile a later verified success.

Proposed default: separate link usability from payment-attempt settlement. A disabled link cannot start another attempt, but an existing attempt can settle. Keep its original amount and reference immutable. Late or mismatched success records the captured money and routes the order to review rather than losing the payment or changing its amount.

Acceptance: verify success after expiry, cancellation and amount change; deliver the callback repeatedly; receive it before the normal return page. Record one capture and one financial event. Never silently attach a payment to a replacement amount. Define permitted entry and exit transitions for `needs_review` and disputes.

### F05. Concurrent refunds need pending-amount reservations

Evidence: [refund controls](../features/07-payments-and-billing.md), lines 184 and 210, prohibit over-refund and lock the intent while calculating the refundable amount. [Repository rules](../../CLAUDE.md) prohibit holding a transaction or lock during a vendor call. The refund design does not state how in-flight refunds reduce the available amount or recover from unknown outcomes.

Proposed default: reserve the refund amount in a transaction before calling the gateway. Include pending amounts when calculating the remaining refundable sum. Use an idempotency key and reconcile unknown outcomes before allowing replacement attempts.

Acceptance: two concurrent partial refunds cannot exceed the capture; a timeout after gateway success does not create a second refund; a failed refund releases its reservation once; a worker crash after success is recovered by reconciliation. Manual refunds require evidence and the same amount limits.

### F06. Mandatory handover can return to AI before a person resolves it

Evidence: [chat acceptance](../features/04-chats-and-ai-agent.md), line 128, says the AI sends nothing further after a complaint handover. Line 321 always hands complaints, refunds and exchanges to a person. Line 311 returns an unclaimed chat to AI after ten minutes without an exception for those reasons.

Proposed default: unresolved mandatory handovers stay with staff. Automatic return applies only to reasons explicitly marked resumable. A holding reply is sent once and does not restart the timer indefinitely.

Acceptance: leave a complaint or request for a person unclaimed beyond the timer. No substantive AI response resumes. A staff resolution followed by an explicit return permits normal replies. A new complaint during a timer cancels automatic return.

### F07. Queued messages need checks at the moment of sending

Evidence: [AI pipeline](../features/04-chats-and-ai-agent.md), lines 305 and 309, rereads the responder and then uses a separate queued send job. [Extension settings](../features/01-account-and-team.md), line 82, stop background jobs; [disconnect](../features/02-channel-connections.md), line 34, pauses sends; [billing](../features/07-payments-and-billing.md), line 337, stops AI and marketing actions in read-only mode.

The requirements do not define what happens when one of those controls changes after a message is queued.

Proposed default: the final sender rechecks the channel, window, responder for AI replies, extension, billing state, kill switches, and current authorization for user-started work. Define the boundary after the provider has already accepted a send.

Acceptance: queue a reply, then take over, disconnect, disable Chats, revoke the member or enter read-only before the worker sends. Each action blocks the relevant pending send with a recorded reason. Existing inbound messages remain available. Marketing sends also recheck current consent and suppression.

## Conflicting rules and missing acceptance

| ID  | Finding and source evidence                                                                                                                                                                                                                                                                                                                                                                                      | Proposed resolution and acceptance                                                                                                                                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F08 | Password lockout differs: [account](../features/01-account-and-team.md) line 97 locks for 15 minutes after five failures; line 304 permits ten password failures per hour and then requires a code.                                                                                                                                                                                                              | Choose one policy for each authentication method. Test account and IP limits, expiry, successful login reset, and code/password switching without bypass.                                                                                                                            |
| F09 | Session lifetime differs: [account](../features/01-account-and-team.md) line 98 gives 30 days when remembered and 12 hours idle otherwise; line 306 applies 30 days sliding generally and 12 hours only to refund-flag members. [Security](../scale-and-security.md) line 176 agrees with the first rule.                                                                                                        | Choose absolute and idle lifetimes explicitly. Test both checkbox states, sliding renewal, refund permission changes, remote logout and stale cache.                                                                                                                                 |
| F10 | MFA differs: [account](../features/01-account-and-team.md) line 317 requires TOTP only for Owners connecting gateways; [security](../scale-and-security.md) line 175 requires Owners and Admins on paid plans after a grace period; [overview](../product/overview.md) line 88 names SMS or WhatsApp codes.                                                                                                      | Decide supported factors, mandatory users and trigger. Specify backup codes, lost-factor recovery and fresh authentication. Acceptance covers enforcement before sensitive actions, recovery auditing and revocation of old factors.                                                 |
| F11 | Owner count differs: [account](../features/01-account-and-team.md) line 101 permits removing another Owner and requires at least one; line 321 requires exactly one. Custom roles are Later at line 149 but R1 at lines 52 and 313 and [overview](../product/overview.md) line 65.                                                                                                                               | Choose owner cardinality and custom-role scope. Test concurrent transfers/removals, new-owner acceptance, old-owner fresh code, and prohibition on leaving a store without an Owner.                                                                                                 |
| F12 | Customer kind violates the authoritative glossary: [customer engineering](../features/03-customers-and-segments.md) line 256 requires a delivered order; [glossary](../product/glossary.md) lines 46–48 count any non-cancelled order or intentional manual/import customer. The glossary wins by line 5.                                                                                                        | Use the glossary. Acceptance covers a pending-order buyer, imported customer with zero orders, chat lead without orders, cancellation, return and deleted/blocked contacts. All counts and plan usage agree.                                                                         |
| F13 | Import can create a second record with the same phone at [customer](../features/03-customers-and-segments.md) line 100, but lines 96 and 276 require phone uniqueness.                                                                                                                                                                                                                                           | Remove that duplicate option or define a distinct identity model. Test duplicate phones within a file, against existing data, and in concurrent imports.                                                                                                                             |
| F14 | Consent merge says any no wins at [customer](../features/03-customers-and-segments.md) line 56; line 260 and [glossary](../product/glossary.md) line 22 say latest answer wins.                                                                                                                                                                                                                                  | Define merge chronology and source evidence. Test importing an old opt-out after a later evidenced opt-in, an opt-out after campaign approval, and equal timestamps. Import confirmation must not manufacture consent evidence.                                                      |
| F15 | SMS replies are unsupported at [customer](../features/03-customers-and-segments.md) line 62, but line 126 requires SMS STOP. [Orders](../features/06-orders-and-delivery.md) line 69 asks SMS recipients to reply yes; [ORD-4](../tasks.md) line 106 names SMS reply confirmation.                                                                                                                               | Use an opt-out link and a signed confirmation link or staff-confirmed call for SMS. Test expired/replayed links, correct order binding, consent withdrawal before a queued send, and WhatsApp text confirmation separately.                                                          |
| F16 | Customer deletion removes history at [customer](../features/03-customers-and-segments.md) line 97, but line 279 and [data model](../product/data-model.md) line 12 soft-delete for 30 days and anonymise messages.                                                                                                                                                                                               | Define immediate visibility and final deletion for contact fields, order addresses/phones, messages, summaries, media, webhooks, exports and consent proof. Test pending jobs and searches after deletion, then purge and backup expiry. Preserve only explicitly justified records. |
| F17 | Debounce is four seconds at [chats](../features/04-chats-and-ai-agent.md) line 64, eight resettable seconds at lines 172 and 293. Acceptance at line 127 demands ten seconds; [performance](../scale-and-security.md) line 77 demands p95 below eight and p50 below four.                                                                                                                                        | Define whether timing starts at first or last message, the default debounce and response SLO. Test a burst, continuous typing, slow model and provider outage against that definition.                                                                                               |
| F18 | Complaint/refund handover appears optional at [chats](../features/04-chats-and-ai-agent.md) lines 48 and 66 but mandatory at lines 179 and 321. Timer options also differ between lines 48, 184 and 311.                                                                                                                                                                                                         | Publish one settings table. Mandatory safety rules cannot be disabled by shop configuration. Test every timer option and the handover exceptions in F06.                                                                                                                             |
| F19 | Saved replies send before handover classification at [chats](../features/04-chats-and-ai-agent.md) lines 297–299. The exclusions at line 173 do not include complaints, refunds or requests for a person.                                                                                                                                                                                                        | Run mandatory safety gates before automatic saved replies. A message matching both a saved phrase and a refund/request-for-person rule must hand over without sending the saved response.                                                                                            |
| F20 | AI may change delivery charge before approval at [chats](../features/04-chats-and-ai-agent.md) line 179, but [orders](../features/06-orders-and-delivery.md) line 255 forbids AI overrides. Tools take no price at [chats](../features/04-chats-and-ai-agent.md) line 307.                                                                                                                                       | Proposed default: AI selects a validated area/zone; the service computes its charge. Staff overrides require permission and an audit entry. Test a prompt asking for a cheaper delivery charge.                                                                                      |
| F21 | Partial delivery is a note plus lower COD at [orders](../features/06-orders-and-delivery.md) line 109, returns undelivered units at line 243, and COD must never be typed at line 271. A later return has no remaining-quantity rule.                                                                                                                                                                            | Model delivered, returned and damaged quantities per item. Recompute item value, allocated discount, delivery, COD and refund due. Test partial delivery followed by late return without double restocking, including damaged units.                                                 |
| F22 | Manual advance verification is by a person at [payments](../features/07-payments-and-billing.md) line 188, but only Owner/Admin at line 222. [Orders](../features/06-orders-and-delivery.md) lines 46–47 and 115 let Edit Orders users enter advances; line 256 subtracts them.                                                                                                                                  | Separate recorded, verified and reversed advances. Only verified money affects COD. A Support agent can record evidence but cannot mark it checked or reduce COD by typing an amount. Reuse of a transaction ID and reversal must be tested.                                         |
| F23 | [Account](../features/01-account-and-team.md) line 105 says chats/orders keep working after nonpayment; [payments](../features/07-payments-and-billing.md) line 164 says they can be viewed; line 337 blocks only AI, campaigns, publishing and automations.                                                                                                                                                     | Define a permission matrix for each billing state: staff replies, public/manual orders, confirmation, COD, refunds, prepaid messages, export and reconnect. Test the matrix at day eight and after payment.                                                                          |
| F24 | SMS packs never expire at [overview](../product/overview.md) line 73; balances remain usable for 12 months after top-up at [payments](../features/07-payments-and-billing.md) line 189. Store data deletion starts after 60 unpaid days plus notice at line 164.                                                                                                                                                 | Clarify expiry and the relationship between wallet records, account deletion and retention. Test unused and partly used top-ups, store closure, dunning deletion, recovery and refund allocation by top-up.                                                                          |
| F25 | Events differ between product and engineering: [payments](../features/07-payments-and-billing.md) lines 228/230 use `payment_intent.succeeded`, line 361 emits `payment.succeeded`; [orders](../features/06-orders-and-delivery.md) lines 119 and 282 differ; [customers](../features/03-customers-and-segments.md) lines 120/287 and [products](../features/05-products-and-stock.md) lines 70/145 also differ. | Establish one event catalogue with schemas, producers and consumers. Test payment success starts the intended workflow once; order return refreshes risk/stats; deletion suppresses queued work; retries do not duplicate effects.                                                   |

## Scope and tracker gaps

| ID  | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Action and acceptance                                                                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F26 | [Order feature](../features/06-orders-and-delivery.md) line 9 and [build order](../development/build-order.md) line 15 refer to ORD-9. [Tracker](../tasks.md) lines 103–108 contains ORD-1 through ORD-6; lines 127–128 contains later ORD-7/8. ORD-9 is absent.                                                                                                                                                                                                   | Add a task for manual dispatch, tracking, delivery/return and COD collection. Test dispatch deducts stock once, records staff and courier details, sends the right update, and manual collection reduces outstanding COD once.                 |
| F27 | [Account task header](../features/01-account-and-team.md) line 9 lists ACC-1 through ACC-8. [Tracker](../tasks.md) lines 46–48 already contains ACC-9 through ACC-11 for email, password and Google.                                                                                                                                                                                                                                                               | Update the mapping; do not add duplicate tasks. Include all authentication methods in the feature acceptance set.                                                                                                                              |
| F28 | [Setup checklist](../features/01-account-and-team.md) lines 73–78 requires store/POS connections to complete. [Q13](../product/open-questions.md) prohibits store sync until answered, while [D6](../product/decisions.md) permits only POS CSV.                                                                                                                                                                                                                   | Make checklist steps reflect available scope. An owner choosing POS can complete setup with the supported import path. Deferred connections cannot make completion impossible.                                                                 |
| F29 | Seven-day merge undo is R1 at [customers](../features/03-customers-and-segments.md) line 135 but `contact_merges` is cut at line 291. Restock requests are required at [products](../features/05-products-and-stock.md) line 129 but deferred at line 149. Test suites are required at [chats](../features/04-chats-and-ai-agent.md) lines 140/313 but `ai_test_cases` is deferred at line 340. [Q10](../product/open-questions.md) says not to create cut tables. | Resolve storage or scope explicitly. Do not silently restore cut tables. Acceptance must demonstrate persistent undo, restock membership and test/version history using an approved model, or clearly mark the corresponding feature deferred. |
| F30 | R1 requirements below have no explicit backend task: customer/POS imports, voice add, exports/deletion, follow-ups, address book and customer insights; product import/restock workflow; store export/closure/recovery/audit page; order printing/export locks/profit inputs. [Task tracker](../tasks.md) has broad list/editor tasks only.                                                                                                                        | Assign each workflow an owner task or explicitly narrow scope. A page task alone does not establish import, deletion, job or provider ownership. Use the matrix below when adding tasks.                                                       |

## Acceptance for uncovered workflows

These checks fill gaps in the current task descriptions. They are proposed criteria for the eventual owning tasks.

| Workflow                             | Proposed acceptance                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer/POS import                  | Preview valid, duplicate and invalid rows before commit; preserve Bangla digit normalization; require explicit consent evidence; stream within the declared file/row limit; retry a batch without duplicate contacts/orders/stock; show a downloadable error report with no formula injection. XLSX and CSV support must match the UI promise. |
| Voice add                            | Handle denied microphone permission and failed transcription; show editable fields and uncertain values; create nothing until review is confirmed; define audio retention and the usage unit. Repeating Save creates one contact.                                                                                                              |
| Customer follow-up                   | Create, assign, snooze, complete and reassign when staff leave; show due/overdue counts in store time; notify once per due occurrence; deletion or permission loss prevents later customer disclosure.                                                                                                                                         |
| Customer insights/RFM                | Use the glossary calculations and documented minimum history; insufficient history shows a clear empty state; RFM groups have stated boundaries; every action opens the actual matching audience and checks marketing reachability.                                                                                                            |
| Address book                         | Store multiple named addresses with district/thana/area; order editing chooses or snapshots the address; later profile changes never rewrite a historical delivery address.                                                                                                                                                                    |
| Product import                       | Preview variants and stock changes; reject duplicate SKU/invalid price combinations consistently; write a movement per applied stock change; replaying a committed batch does not add stock again.                                                                                                                                             |
| Restock waiting list                 | Record the requested variant and consent/window evidence; repeated requests deduplicate; positive available stock prompts the owner once; approval rechecks availability, channel rules and suppression. Out-of-stock again blocks stale sends.                                                                                                |
| Print invoices and labels            | Permission and phone-masking rules apply to generated files; selected orders appear once; barcode identifies the intended order without exposing tenant access; download links expire; a reprint does not alter fulfilment or invoice numbering.                                                                                               |
| Order export and lock                | Preview the selected orders and fields; require export permission; record who exported/locked them; define which edits remain allowed and how an authorized user unlocks them. Export retries do not move stages.                                                                                                                              |
| Order profit                         | Snapshot item cost, courier charge, COD fee and payment fee; distinguish unknown cost from zero cost; partial returns/refunds revise profit without rewriting historical price evidence.                                                                                                                                                       |
| Store export and closure             | Verify Owner and fresh authentication; export only authorized store data; cancel renewal once; stop sends and queued work; retain financial records only under a stated exception; support undo within the grace period restores consistent access; final purge covers files, indexes and caches.                                              |
| Invitations and ownership            | Bind acceptance to the intended verified identity; reject expired, revoked, used and wrong-recipient tokens; concurrent invites respect seat limits; role changes invalidate caches; ownership transfer cannot leave zero Owners or exceed the chosen cardinality.                                                                             |
| Knowledge versions and practice mode | Persist expected tests and the exact knowledge/settings version; define pass/fail; failed tests block Go live; publication reruns required tests; undo restores the chosen version. Batch-test real chats only with access and data-handling rules.                                                                                            |
| Payment credentials and disputes     | Rotation/disconnect does not strand pending verification/refunds; record which credential/account an attempt used; sandbox success cannot pay a live order; dispute events alter financial status once and preserve the original capture and deadline.                                                                                         |
| Usage and auto top-up                | Concurrent AI sends cannot consume one remaining unit twice; document whether failed sends are charged; auto-top-up has one pending charge per trigger and a configured cap; retries and duplicate callbacks credit the wallet once.                                                                                                           |

## Coverage matrix

Every meaningful subfeature in the seven documents appears below. Existing task IDs are references to [the tracker](../tasks.md), not claims that implementation exists. Covered means the task names the work. Partial means a broader task could contain it but ownership or acceptance is incomplete. Unmapped means no task explicitly owns it. Decision means an existing open question or release decision controls it.

### Account, stores and team

Source: [feature 01](../features/01-account-and-team.md), especially lines 43–54, 58–149 and 288–352. Task rows are at tracker lines 44–54, with billing at 134–141.

| Subfeature                                           | Scope / tasks           | Coverage and follow-up                                                            |
| ---------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------- |
| SMS sign-up, verify, code resend                     | R1 ACC-1/2              | Covered; F08 and invitation/identity abuse acceptance                             |
| Email code, password/reset, Google                   | R1 ACC-9/10/11          | Covered; F27 stale header, F08/F10 policies                                       |
| Four-step onboarding, suggested plan, Free or trial  | ACC-2/8, PAY-7          | Partial; Free selection conflicts with unconditional trial acceptance at line 351 |
| Setup checklist, hide guide, change setup            | ACC-8 or HOME-3         | Unmapped workflow; F28                                                            |
| Extension defaults, switches, hidden links, job stop | ACC-6/8                 | Partial; final job checks in F07, dependency behaviour needed                     |
| Store settings/profile/contact verification          | ACC-6/8                 | Settings covered; verified-contact change and recovery partial                    |
| Memberships and store switching                      | ACC-3/6, Q3             | Covered; extra-store policy remains a decision                                    |
| Organisation and shared bill                         | Q11                     | Decision: no organisation under current assumption                                |
| Built-in/custom roles and flags                      | ACC-4/8                 | Partial; F11 scope and owner count                                                |
| Invite, accept, resend, cancel, seats, remove        | ACC-5/8                 | Covered broadly; acceptance above                                                 |
| Ownership transfer                                   | ACC-4/5                 | Partial; F11                                                                      |
| Devices, logout, MFA, recovery, new-device alert     | ACC-7/9                 | Devices/TOTP covered; recovery/alerts partial; F09/F10                            |
| Owner audit/activity page                            | DB-3, ACC-8             | Ledger covered; page unmapped                                                     |
| Full export, close, support undo, purge              | ACC-6, ADM-2/3 possible | Unmapped lifecycle; acceptance above                                              |
| Plan change/cancel, usage/limits, reminders/dunning  | PAY-1/7/8/9             | Covered broadly; F23/F24                                                          |
| Bangla app UI                                        | R2                      | Deferred by existing scope                                                        |
| Physical Shop setup and staff role                   | R2 D1                   | Deferred; do not require unavailable checklist steps                              |

### Channel connections

Source: [feature 02](../features/02-channel-connections.md), lines 28–49 and 124–172. Tasks: tracker lines 72–76 and CAMP-1/CAMP-3 at 159–161.

| Subfeature                                           | Scope / tasks   | Coverage and follow-up                                                           |
| ---------------------------------------------------- | --------------- | -------------------------------------------------------------------------------- |
| Facebook/Instagram connect and reconnect             | CHN-2/4/5       | Covered; bind OAuth state to initiating store/session and test rejection/replay  |
| WhatsApp Embedded Signup/Coexistence                 | CHN-3, Q2       | Covered but blocked on BSP choice                                                |
| Templates, approval status, rejected-template fix    | CAMP-1/4        | Covered across features                                                          |
| Quality/tier, daily caps, quiet hours                | CHN-3/5, CAMP-3 | Partial health/configuration ownership                                           |
| SMS sender-ID application, documents, approval, test | ACC-1, CHN-5    | Driver covered; application workflow unmapped                                    |
| SMS credit balance and send limits                   | PAY-8, CAMP-3   | Covered across features                                                          |
| Signature, deduplication, webhook intake and routing | CHN-1/4         | Covered; test durable recovery after save-before-enqueue crash and event batches |
| Token health, disconnect, preserved history          | CHN-4/5         | Covered broadly; F07 and reconnect/pending-event acceptance                      |
| Shopify/WooCommerce connection                       | Q13             | Not built until answered                                                         |
| POS connectors and CSV                               | D6              | Connectors R2; R1 CSV unmapped                                                   |

### Customers and segments

Source: [feature 03](../features/03-customers-and-segments.md), lines 41–142 and 250–303. Tasks: tracker lines 68–77 and 157–158.

| Subfeature                                                     | Scope / tasks            | Coverage and follow-up                                                         |
| -------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------ |
| List, search, filters, sorting, columns, bulk actions          | CUS-5                    | List covered; bulk backend ownership partial                                   |
| Profile, orders/activity/campaign tabs, notes/preferences      | CUS-5 plus ORD/CHAT/CAMP | Partial cross-feature timeline and permissions                                 |
| Manual add/edit and contact kinds                              | CUS-1/5                  | Partial; F12                                                                   |
| Phone/channel identities, duplicate suggestions, merge         | CUS-1/4                  | Covered; D25 closes F01 with narrowed verification; F13/F14 remain             |
| Seven-day merge undo                                           | Q10                      | Unresolved storage/scope; F29                                                  |
| Consent ledger, opt-out, blocks, evidence                      | CUS-2, CAMP-3            | Covered; F14/F15                                                               |
| Phone masking and export flags                                 | ACC-4, CUS-5, API-3      | Shared rules already require server-side masking                               |
| XLSX/CSV import, map, preview, results/error file              | No explicit task         | Unmapped; engineering line 272 says CSV while line 46 promises XLSX too        |
| POS sales import                                               | D6 R1                    | Unmapped                                                                       |
| Voice add, review, confidence and speech costs                 | No explicit task         | Unmapped; LLM driver alone does not own speech workflow                        |
| Filtered/selected export and consent evidence                  | CUS-5 possible           | Unmapped export workflow                                                       |
| Delete, anonymise, purge                                       | CUS-5 possible           | Unmapped lifecycle; F16                                                        |
| Follow-up, assignment, snooze and reminders                    | HOME-1/2, CUS-5 possible | Notification plumbing covered; follow-up workflow unmapped                     |
| Address book with district/thana/area                          | CUS-5, ORD-2 possible    | Unmapped address-book workflow                                                 |
| Stats and lifecycle                                            | CUS-3                    | Covered; F12 glossary conflict                                                 |
| Ready-made/custom segments, reset/delete, counts               | CUS-6/7                  | Covered                                                                        |
| Event conditions, open window, lead temperature, groups/limits | CUS-6                    | Partial; engineering field list at line 268 omits event implementation details |
| AI-generated segment rules and explanations                    | CUS-7, AI-2 possible     | Backend ownership partial                                                      |
| Insights, RFM, calculations and actions                        | ANA-1/3, CUS-5 possible  | Partial; customer insights/RFM not explicitly owned                            |
| Predictive metrics, Daraz/Sheets, Khata                        | R2                       | Deferred                                                                       |

### Chats and AI agent

Source: [feature 04](../features/04-chats-and-ai-agent.md), lines 42–192 and 281–354. Tasks: tracker lines 83–88 and 114–121.

| Subfeature                                               | Scope / tasks              | Coverage and follow-up                                                             |
| -------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------- |
| Inbox tabs, filters, bulk actions, typing/presence       | CHAT-1/3/5                 | Covered broadly; simultaneous-reply behaviour partial                              |
| Inbound messages, image description, voice transcription | CHAT-1                     | Text covered; media provider/processing ownership partial                          |
| Outbound, retries, receipts and channel windows          | CHAT-2                     | Covered; F07 and unknown provider outcome acceptance                               |
| Notes, assignment, status, takeover, return timer        | CHAT-3                     | Covered; F06/F18                                                                   |
| Round robin/online/fewest open, SLA, working hours       | CHAT-3                     | Partial; eligibility, teams, absence and timer rules needed                        |
| Saved replies, automatic matching, phrase suggestions    | CHAT-4                     | Covered broadly; F19                                                               |
| Product cards, order form and payment links              | CHAT-5, AI-5, ORD-3, PAY-6 | Covered across tasks                                                               |
| Comments, public/private reply, hide/delete spam         | CHAT-6                     | Covered; once per person/post at line 145 vs once per comment at 174 needs one cap |
| Not a customer and channel blocking                      | CUS-1, CHAT-3/5            | Partial; exclusions specified                                                      |
| AI settings, language, tone and pause scopes             | AI-4/8                     | Covered; F18                                                                       |
| Knowledge/teach/files/links/feedback/version undo        | AI-3/8                     | Knowledge covered; feedback/version and voice-teaching workflow partial            |
| Classification, retrieval, fact checks, tool access      | AI-4/5                     | Covered; F19/F20; D25 merge rule gates history                                     |
| Draft/confirm/edit/cancel order                          | AI-5, ORD-3/4              | Covered; F03/F20/F22                                                               |
| Handover, provider failure, spend/fairness controls      | AI-2/4                     | Covered; F06/F07 and Q15                                                           |
| Practice mode, test suite, Go live, last-50-chat batch   | AI-6/7/8                   | Covered tasks; F29 storage and pass criteria unresolved                            |
| Chat/profile summaries and lead temperature              | AI-4/5 possible            | Ownership partial                                                                  |
| Restock tool                                             | AI-5, PROD-4               | Required but storage deferred; F29                                                 |
| AI performance, resolution and usage                     | PAY-1, ANA-1/3             | Broad coverage; concurrency/failure charging acceptance needed                     |
| Ask Dakly chat side panel                                | HOME-4, CHAT-5             | Broad coverage; scope of report tools must follow current chat permissions         |
| Ad referral capture                                      | R2                         | Deferred                                                                           |

### Products and stock

Source: [feature 05](../features/05-products-and-stock.md), lines 37–86 and 122–159. Tasks: tracker lines 94–97.

| Subfeature                                           | Scope / tasks           | Coverage and follow-up                                         |
| ---------------------------------------------------- | ----------------------- | -------------------------------------------------------------- |
| Products/options/variants/SKU/prices/cost/visibility | PROD-1/4                | Covered; zero to three option types specified                  |
| Ledger, reserve/release/ship/return/adjust/import    | PROD-2                  | Covered; F02/F03                                               |
| List, nudges, asked counts, readiness and AI preview | PROD-4                  | Broad task; event inputs and preview partial                   |
| Photo upload and private storage                     | PROD-3                  | Covered; shared security adds validation and scan requirements |
| Product import                                       | No explicit task        | Unmapped                                                       |
| Aliases, embeddings and photo product search         | AI-3/5, PROD-1 possible | Partial cross-feature ownership                                |
| Restock waiting list and owner-approved notification | PROD-4, AI-5            | Storage deferred; send workflow unmapped                       |
| Delete guard and historical order snapshots          | PROD-1/4, ORD-1         | Partial acceptance                                             |
| Multi-location, POS stock, counter sales             | R2                      | Deferred                                                       |

### Orders and delivery

Source: [feature 06](../features/06-orders-and-delivery.md), lines 44–155 and 235–296. Tasks: tracker lines 103–108 and 127–128.

| Subfeature                                            | Scope / tasks     | Coverage and follow-up                              |
| ----------------------------------------------------- | ----------------- | --------------------------------------------------- |
| Pipeline, stages, holds, events and numbering         | ORD-1/5           | Covered; F21 damaged/partial detail                 |
| Staff/chat create/edit and paste extraction           | ORD-3/5, AI-5     | Creation covered; paste extraction partial          |
| Reservation and edit deltas, duplicate warning        | ORD-1/3, PROD-2   | Covered broadly; F03                                |
| Zones, areas, charge and override                     | ORD-2             | Covered; F20                                        |
| Confirmation, waiting alerts, high risk and advance   | ORD-4, PAY-6      | Covered; F15/F22                                    |
| Return-risk history                                   | CUS-3, ORD-5      | Covered through glossary; cross-store risk excluded |
| Manual dispatch/tracking/delivery/return/COD          | Referenced ORD-9  | Tracker row missing; F26                            |
| Partial delivery, late return, damaged goods          | ORD-1/5           | Partial; F21                                        |
| Public catalogue/product order page and abuse limits  | ORD-6             | Covered; design gap acknowledged                    |
| Payment state, advances and refund due                | PAY-6, ORD-1/3    | Covered; F22                                        |
| Print invoice, bulk labels/barcodes, export lock      | No explicit task  | Unmapped                                            |
| Profit, courier/COD/payment costs                     | ANA-1 possible    | Inputs and historical costs not explicitly owned    |
| Courier API, booking, payout matching, recommendation | ORD-7/8 later D21 | Correctly excluded despite historical rows          |
| Store sync, Daraz and WhatsApp catalogue checkout     | Q13 / R2          | Correctly gated                                     |

### Payments and billing

Source: [feature 07](../features/07-payments-and-billing.md), lines 60–245 and 324–377. Tasks: tracker line 62, lines 134–141, and ADM-4 at 179.

| Subfeature                                        | Scope / tasks       | Coverage and follow-up                                                  |
| ------------------------------------------------- | ------------------- | ----------------------------------------------------------------------- |
| Flow A/B account and credential separation        | PAY-2–6, DB-4       | Covered with explicit checks and acceptance                             |
| Connect/test/replace/disconnect credentials       | PAY-3/4/5/9         | Covered broadly; pending-attempt lifecycle acceptance above             |
| bKash/Nagad/City Bank and sandbox                 | PAY-3/4/5           | Covered; merchant access dependency acknowledged                        |
| Customer link, public page, receipt and retry     | PAY-6/9             | Backend covered; public UI task mapping partial                         |
| Intent, callback, verification and reconciliation | PAY-2               | Covered; F04                                                            |
| Shop payments list/detail and CSV                 | PAY-6/9             | Partial; distinguish Orders payments from subscription invoices         |
| Manual payment/check/transaction ID/screenshot    | PAY-6 possible      | Not explicitly owned; F22                                               |
| Full/partial/manual refunds and disputes          | PAY-6, ADM-4        | Covered broadly; F05 and dispute lifecycle                              |
| Trial, subscription, upgrade/downgrade/cancel     | PAY-7/9             | Covered; state-specific acceptance required                             |
| Agreements, cancellation and renewal              | PAY-3/7             | Covered                                                                 |
| Dunning, read-only, deletion and recovery         | PAY-7               | Covered broadly; F23/F24                                                |
| Usage/meter/thresholds/deduplication/add-on       | PAY-1/8/9           | Covered; concurrent allowance and failed-send charging partial          |
| SMS/WhatsApp top-up, automatic top-up and refund  | PAY-8               | Wallet covered; automatic charge and top-up allocation acceptance above |
| Invoice/credit note/VAT/number/PDF/email          | PAY-8, ADM-4, ACC-9 | Covered; define financial-retention exception to store purge            |
| Flow-A settlement reports/reconciliation queue    | PAY-2, ADM-4        | Covered; flow B intentionally export-only                               |
| Card tokenisation, Rocket and SSLCommerz          | Conditional/later   | Not an unconditional launch requirement                                 |

## Existing findings verified or rejected

The [prototype review](../design/prototype-review.md), line 3, says later decisions and feature docs override historical findings. Apply that precedence rather than treating every old question as unresolved.

| Existing claim                                                                 | Result                                                                                                                                                                              |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inbox and Orders have no design or committed scope                             | Rejected as a current scope gap. Features 04/06 have screenshots, rules and tasks. Historical missing-design sections remain stale.                                                 |
| Email sign-in/Google mobile verification undecided                             | Rejected. D20 and feature 01 specify them; ACC-9/10/11 own the work.                                                                                                                |
| No billing grace-period flow                                                   | Rejected. Feature 07 defines retries and day-eight restrictions. The exact restriction matrix is still F23.                                                                         |
| AI usage unit/lifetime value have no definition                                | Rejected. The glossary defines both. Implementation must follow it.                                                                                                                 |
| WhatsApp cannot keep the Business app                                          | Superseded by feature 02 Coexistence requirement. Old migration warnings at lines 105–109 must not override it.                                                                     |
| Organisation and one bill must ship in R1                                      | Superseded by Q11 working assumption.                                                                                                                                               |
| Courier APIs must ship in R1                                                   | Superseded by D21; manual dispatch still needs ORD-9.                                                                                                                               |
| Shopify/WooCommerce sync must ship in R1                                       | Gated by Q13, not an accepted missing implementation.                                                                                                                               |
| Bangla app UI must ship in R1                                                  | Deferred by current scope; Bangla AI output remains R1.                                                                                                                             |
| Imports stop at customer plan limit                                            | Superseded by ACC-R8 and feature 03 line 112: save over-limit records and restrict marketing.                                                                                       |
| Public order page, Embedded Signup, follow-ups and payment screens need design | Still valid: feature 06 line 231, feature 02 line 122, feature 03 lines 223–236 and feature 07 line 320 acknowledge gaps. Phone/empty/error states remain listed in open questions. |

Shared rules already require CSRF Origin checks, immediate role/session invalidation, service-side phone masking, fresh authentication for sensitive actions, SSRF protection for knowledge URLs, restricted uploads, envelope encryption and export formula-injection protection. See [authentication rules](../rules/auth-and-permissions.md), [security rules](../rules/security.md), and [scale and security](../scale-and-security.md), lines 188–196. Do not report those protections as absent merely because each feature does not repeat them. The owning tasks should still demonstrate the relevant acceptance checks.
