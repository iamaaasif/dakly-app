# Admin panel

|           |                                                                                               |
| --------- | --------------------------------------------------------------------------------------------- |
| Release   | 1 (lean core)                                                                                 |
| Status    | Not started                                                                                   |
| Extension | Internal, staff only                                                                          |
| Code      | `apps/admin` (Next.js), `packages/core/src/admin/` mounted under `/admin` on its own hostname |
| Tasks     | ADM-1 to ADM-5                                                                                |

## Purpose

The console Dakly's own team uses to look after shops, handle support, manage plans and money, watch messaging providers and AI cost, and stop abuse. Shops never see it. There is no prototype design.

## Decisions that change the PRD

The product requirements below are the PRD text from 12 November 2026. Where a later decision changed it, the decision wins:

- D17: the AI provider row is OpenAI, not the Claude API.
- D21: courier provider rows come with the courier release.
- D22: add a row for SendGrid (transactional email).

## Product requirements

### What it is for

The admin panel is the internal console Dakly's own team uses to run the business: look after shops, handle support, manage plans and money, watch messaging providers and AI cost, stop abuse, and see company metrics. Shops never see it.

It is a separate app at `admin.dakly.app`, with its own sign-in, its own staff accounts and stricter security than the shop app. It reads the same database through the same API layer, using dedicated admin endpoints that write an audit row for every action.

**Release:** a lean core ships with release 1, because Dakly cannot launch without support, billing and provider controls. The rest follows when the team grows.

| Area                                                                | Release 1 | Later                                 |
| ------------------------------------------------------------------- | --------- | ------------------------------------- |
| Shops list and shop detail                                          | Yes       |                                       |
| Support access (view as shop, with consent)                         | Yes       |                                       |
| Plans, prices, coupons, VAT rate                                    | Yes       |                                       |
| Billing operations: invoices, refunds, credits, balance adjustments | Yes       |                                       |
| Payment reconciliation queue                                        | Yes       |                                       |
| Messaging providers, WhatsApp BSP, SMS sender IDs, template status  | Yes       |                                       |
| AI usage and cost per shop, global AI kill switches                 | Yes       |                                       |
| Abuse and compliance queue (spam, opt-outs, bans)                   | Yes       |                                       |
| Feature flags and extension rollout                                 | Yes       |                                       |
| Company metrics (MRR, churn, activation)                            | Basic     | Cohorts and forecasting               |
| Staff accounts, roles, audit log                                    | Yes       |                                       |
| In-app announcements and maintenance banners                        | Yes       |                                       |
| Data requests (export, delete)                                      | Yes       |                                       |
| Partner and reseller management                                     |           | Yes                                   |
| Support ticketing                                                   |           | Use an external helpdesk until needed |

### User stories

- As a **support agent at Dakly**, I want to find a shop by phone, store name or order number in seconds, so that I can help a shop owner on a call.
- As a **support agent**, I want to see what the owner sees, with their permission, so that I can reproduce a problem without asking for their password.
- As **finance**, I want to issue a refund, a credit note or a balance adjustment with a reason, so that billing mistakes are fixed and audited.
- As **finance**, I want a queue of payments that do not match the gateway report, so that the books close every month.
- As **ops**, I want to see each messaging provider's delivery rate and switch SMS traffic to the backup provider, so that an outage does not stop shops.
- As **ops**, I want to pause AI replies for one shop or for everyone, so that a bad AI behaviour can be stopped at once.
- As **trust and safety**, I want to see shops flagged for spam or high opt-out rates and suspend them, so that Dakly's WhatsApp and SMS numbers stay healthy.
- As the **founder**, I want MRR, new paying shops and churn on one page, so that I know how the business is doing.
- As a **super admin**, I want to give each staff member only the access their job needs, and see everything they did.

### Screens

#### Sign-in

- Email and password plus a mandatory second factor: passkey or authenticator app (TOTP). SMS codes are not allowed for staff.
- Access only from allowed networks: Cloudflare Access in front of `admin.dakly.app` with Dakly's identity provider (Google Workspace), plus an optional IP allowlist.
- Sessions last 8 hours, idle timeout 30 minutes, one active session per staff member.

#### Home

- Today's numbers: new sign-ups, new paying shops, MRR, failed renewals, open reconciliation items, abuse flags, provider health (green, amber, red per provider), AI spend today against the daily budget.
- A list of "needs action" items assigned to the signed-in staff member.

#### Shops

- **List:** search by store name, owner phone, store ID, Facebook page ID, order number or invoice number. Columns: store, owner, plan, status (trial, active, past\_due, read\_only, suspended, deleted), MRR, sign-up date, last active, health score, flags. Filters on each. Export to CSV (finance and super admin only, logged).
- **Shop detail**, with tabs:
  - **Overview:** owner and team (names and roles, phones masked), plan and renewal, balances, connected channels (Facebook page, Instagram, WhatsApp number, quality rating), connected couriers and gateways (status only, never secrets), extensions on, usage this period against limits, health score and reasons.
  - **Billing:** subscriptions, invoices, payments, refunds, credit notes, balance ledger. Actions: refund, issue credit, extend trial, apply coupon, change plan, adjust balance, all with a required reason.
  - **Messaging:** WhatsApp and SMS sent, delivered, failed, opt-outs and blocks in the last 30 days; template list with approval status; sender ID.
  - **AI:** AI replies, tokens and cost this period; recent AI replies flagged by owners; per-shop AI switch (on, paused) and per-shop monthly AI cost cap.
  - **Activity:** the shop's own activity log (read-only) and every admin action ever taken on this shop.
  - **Support access:** request access, see current grants.
  - **Danger zone:** suspend, unsuspend, schedule deletion, export data. Each needs a reason and, for deletion, a second staff member's approval.

#### Support access (view as shop)

- A support agent clicks Request access and chooses scope (read-only or read and write) and duration (30 minutes to 24 hours). The owner gets an in-app prompt and an SMS with a code. Access starts only when the owner approves.
- During access, the admin opens the shop app in a separate session marked by a red bar: "Dakly support (Rahim) is viewing this store. Read-only. Ends 15:40." The owner also sees a banner that support is in their store, with an End now button.
- Messages, orders and customer data are visible only inside this granted session. Outside it, admin screens show counts and metadata, never message bodies or customer phone numbers.
- Break-glass: a super admin can open read-only access without consent during a security incident or legal request. It needs a written reason, alerts the other super admins, and is listed in the shop's activity log.

#### Plans and pricing

- Plans: name, monthly and yearly price, VAT inclusive or not, limits (stores, team seats, contacts, AI credits, automations, social accounts), included extensions, visibility (public, hidden, legacy).
- Add-ons: Chats AI add-on tiers.
- Unit prices: SMS per message, WhatsApp margin over Meta's rate per category, AI credit packs.
- Coupons: code, percent or fixed, duration (once, N months, forever), limit of uses, expiry, which plans.
- Changing a price never changes existing subscribers until their next renewal, and only if "Apply to existing" is ticked, which schedules a 30-day notice to each affected shop.
- VAT rate and invoice details (Dakly's legal name, BIN, address) live here and are read by invoicing.

#### Billing operations and reconciliation

- All invoices, payments and refunds across shops, with filters.
- **Reconciliation queue:** lines from the nightly gateway settlement import that did not match a Dakly payment, and Dakly payments that no settlement line confirmed after 3 days. Actions: match by hand, mark as gateway error, create a refund, escalate.
- **Dunning view:** shops in past\_due and read\_only, with retry history and one-click "Send reminder now".
- Monthly close report: gross, VAT, refunds, net per gateway, exported as CSV for the accountant.

#### Providers and messaging health

- One row per provider: WhatsApp BSP, SMS primary (Alpha SMS) and backup (SSL Wireless), payment gateways (Dakly's own accounts), OpenAI (D17), SendGrid (D22). Courier rows come with the courier release (D21).
- For each: status, error rate and latency over the last hour and day, balance with the provider where there is one (SMS credit, WhatsApp prepaid), and the date the credentials expire.
- Actions: switch SMS traffic to the backup provider, pause a provider, rotate credentials (opens the secrets workflow, never shows the secret).
- WhatsApp: each shop's number with quality rating and messaging tier from Meta, templates pending or rejected, and alerts when a number drops to Low quality.
- SMS: sender ID (masking) requests per shop, with status (requested, submitted to operator, approved, rejected).

#### AI operations

- Spend today and month-to-date against budget, by model and by feature (Chats replies, content, campaigns, Ask Dakly AI).
- Top 20 shops by AI cost, and shops whose cost exceeds their plan revenue.
- Global switches per AI feature: on, paused (fall back to "a person will reply soon"), or using the cheaper model only.
- Prompt and model version in use per feature, with rollout percentage. Changes go through feature flags (3.10).
- Flagged AI replies: replies owners marked as wrong, with the conversation excerpt shown only if the owner allowed sharing when flagging.

#### Trust and safety

- Queue of automatic flags: high opt-out rate (over 2% of a send), high WhatsApp block rate, SMS complaints, sudden contact import over 10,000, sign-ups from the same device or payment account, keyword hits for banned products (drugs, weapons, gambling, adult, fake goods) in product names and campaigns.
- Actions: dismiss with a note, warn the shop (in-app and SMS), pause sending, suspend the shop. Suspension stops all sending and AI but keeps data and lets the owner export it.
- Global block lists: phone numbers that asked never to be contacted by any Dakly shop (if regulation requires), and banned keywords.

#### Feature flags and announcements

- Flags with targeting by percentage, plan, shop ID list or staff only. Every flag shows who changed it and when.
- Extension rollout uses the same flags (for example Physical Shop beta for 20 shops).
- Announcements: in-app banner or modal, audience (all, plan, shop list), schedule, language (Bangla and English). Maintenance banner with start and end time.

#### Metrics

- MRR, ARR, new MRR, expansion, contraction, churned MRR, net MRR movement by month.
- Paying shops, trials, trial-to-paid conversion, logo churn, revenue churn.
- Activation: share of new shops that connected a channel, received a first AI reply and created a first order within 7 days.
- Usage: messages, AI replies, orders created, campaign sends per day.
- All definitions come from the Glossary tab; the admin panel uses the same metric service as the shop app, so numbers never disagree.

#### Staff and audit

- Staff list, roles, last sign-in, 2FA method, active sessions. Invite, change role, disable. Disabling ends all sessions at once.
- **Audit log:** every admin action with who, when, IP, shop, action, before and after values, and reason. Searchable and exportable by super admins. Append-only; nobody can edit or delete it.

#### Data requests

- Requests from shops (export all data, delete store) and from their customers through the shop (delete my data). Status, due date, who handled it. Export produces a signed R2 link valid for 7 days.

### How it works

1. **Separate app, same backend.** The admin panel is its own Next.js app calling `/admin/*` API routes in the NestJS monolith. These routes use a separate guard: the staff JWT is issued only by the admin sign-in, carries the staff role, and is never accepted by shop routes, and the other way round.
2. **Crossing tenants on purpose.** Shop routes always run with row-level security set to one store. Admin routes run with an admin database role that can read across stores, but every admin query goes through a service that (a) checks the staff role's permission for that action, (b) strips fields the role may not see (message bodies, customer phones, secrets), and (c) writes an audit row in the same transaction as any change.
3. **Support access** creates a time-limited grant row (staff, store, scope, expiry, approved\_by owner). The support session gets a short-lived shop token scoped to that store with an `impersonator` claim. Every action taken in that session is logged in both the shop's activity log and the admin audit log, with the staff member's name.
4. **Two-person rule** for the most dangerous actions: store deletion, refunds or credits above ৳50,000, bulk price changes, global AI pause, and break-glass access. The first staff member requests; a second with the right role approves within 24 hours, or the request expires.
5. **Money actions** call the same billing service the shop app uses (tab 10). The admin panel never writes to billing tables directly, so invoices, ledgers and gateway calls stay consistent.
6. **Provider switches and kill switches** are feature flags read by the workers on every job, cached for at most 30 seconds, so a switch takes effect across the system within a minute.
7. **Metrics** are read from the analytics store (Postgres materialised views at launch, ClickHouse later), refreshed every 15 minutes, never from live transactional queries.

### Business rules

- **ADM-R1** Staff accounts must use a passkey or TOTP. Accounts without 2FA cannot sign in.
- **ADM-R2** The admin panel is reachable only through Cloudflare Access with Dakly's identity provider; the origin rejects any request without a valid Access token.
- **ADM-R3** Every write action requires a reason of at least 10 characters and creates an audit row in the same transaction. If the audit write fails, the action fails.
- **ADM-R4** Staff cannot see message bodies, customer phone numbers or files of a shop unless a support access grant is active, or break-glass is used.
- **ADM-R5** Nobody, including super admins, can see stored secrets (gateway keys, Facebook tokens, courier keys). They can only see status and rotate them.
- **ADM-R6** Two-person approval is required for the actions listed in 4.4.
- **ADM-R7** Staff cannot act on a store they own or work in (conflict of interest check on phone and email).
- **ADM-R8** Balance adjustments are ledger entries with a type (credit, debit, refund, goodwill), never edits of a balance number.
- **ADM-R9** A suspended shop keeps all its data and can still sign in to export it and see the reason for suspension.
- **ADM-R10** Price changes for existing subscribers need 30 days' notice to the shop by SMS, WhatsApp and in-app.
- **ADM-R11** The audit log is kept for at least 7 years (financial records), stored append-only with a daily hash chain so tampering can be detected.
- **ADM-R12** Admin exports containing personal data are watermarked with the staff member's name, expire after 24 hours and are logged.

### Roles and permissions

| Capability                            | Super admin      | Support               | Finance     | Ops         | Trust and safety | Read-only (analyst) |
| ------------------------------------- | ---------------- | --------------------- | ----------- | ----------- | ---------------- | ------------------- |
| Search and view shops (metadata)      | Yes              | Yes                   | Yes         | Yes         | Yes              | Yes                 |
| Request support access                | Yes              | Yes                   | No          | No          | Yes              | No                  |
| Break-glass access                    | Yes (two-person) | No                    | No          | No          | No               | No                  |
| Refunds, credits, balance adjustments | Yes              | Up to ৳2,000 goodwill | Yes         | No          | No               | No                  |
| Plans, prices, coupons, VAT           | Yes              | No                    | Yes         | No          | No               | No                  |
| Reconciliation                        | Yes              | No                    | Yes         | No          | No               | View                |
| Providers and kill switches           | Yes              | No                    | No          | Yes         | No               | View                |
| Feature flags and announcements       | Yes              | No                    | No          | Yes         | No               | No                  |
| Suspend or unsuspend a shop           | Yes              | No                    | No          | No          | Yes              | No                  |
| Delete a store                        | Yes (two-person) | No                    | No          | No          | No               | No                  |
| Metrics                               | Yes              | Basic                 | Yes         | Yes         | Basic            | Yes                 |
| Staff and roles                       | Yes              | No                    | No          | No          | No               | No                  |
| Audit log                             | Yes              | Own actions           | Own actions | Own actions | Own actions      | No                  |

### States and edge cases

| Case                                           | What happens                                                                                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Owner does not answer a support access request | Request expires after 30 minutes; the agent can ask again or help without access.                                            |
| Owner ends access early                        | The support session ends within 10 seconds; open pages show "Access ended by the owner".                                     |
| Staff member leaves Dakly                      | Disabling the account in the identity provider and in the panel ends all sessions and grants immediately.                    |
| Second approver not available                  | The request waits up to 24 hours, then expires; super admins are reminded at 4 and 20 hours.                                 |
| Provider switch while sends are in flight      | Jobs already handed to the old provider finish there; new jobs go to the new one.                                            |
| Global AI pause                                | Inbound messages still arrive and are routed to people; shops see a banner "AI replies are paused by Dakly for maintenance". |
| Metrics refresh fails                          | Page shows the last good time ("Updated 45 min ago") instead of wrong numbers.                                               |

### Events and notifications

Events: `admin.action` (every write, with type), `support_access.requested`, `support_access.granted`, `support_access.ended`, `store.suspended`, `store.unsuspended`, `store.deletion_scheduled`, `price.changed`, `flag.changed`, `provider.switched`, `ai.paused`.

Alerts to staff go to a Dakly Slack channel and the admin home (shops get transactional email under D20; staff alerting through Slack is internal and allowed). Shops are told by in-app and SMS when support requests access, when they are warned or suspended, and when prices change.

### Acceptance criteria

1. **Given** a staff account without 2FA, **when** it signs in, **then** it is forced to set up a passkey or TOTP before seeing any page.
2. **Given** a request to `admin.dakly.app` without a Cloudflare Access token, **then** the origin returns 403.
3. **Given** a Support role, **when** they open a shop's Chats data without a grant, **then** they see counts only, no message text.
4. **Given** the owner approved read-only support access, **when** the agent tries to send a message, **then** it is blocked and logged.
5. **Given** any admin write, **when** the audit insert fails, **then** the change is rolled back.
6. **Given** a refund of ৳60,000, **when** a finance user submits it, **then** it waits for a second approver and no gateway call is made until approval.
7. **Given** ops switches SMS to the backup provider, **when** a new SMS job runs within 60 seconds, **then** it uses the backup provider.
8. **Given** a shop token, **when** it calls any `/admin/*` route, **then** it gets 403, and a staff token on shop routes gets 403.
9. **Given** MRR on the admin metrics page and the sum of active subscriptions, **then** they match to the taka.
10. **Given** a suspended shop owner signs in, **then** they see the suspension reason and can export their data, and nothing is sent from their store.

### Beyond the prototype

The prototype has no admin panel at all; everything here is new. Patterns taken from other products:

- **Support access with consent:** Shopify collaborator access requests and Intercom's "impersonate with permission" both require the account owner's approval and show who is inside. Dakly copies the consent, the time limit and the visible banner.
- **Audit and two-person approval:** standard in Stripe's dashboard for sensitive actions and in banking back offices; Bangladesh Bank expects strong audit trails from anyone touching payments.
- **Kill switches and flags:** the pattern from LaunchDarkly-style flag systems, built in-house in release 1 as a simple table with caching, because a third-party flag service is not needed at Dakly's size.
- **Messaging health:** WhatsApp quality ratings and messaging tiers are Meta's own signals; BSP dashboards (Gupshup, 360dialog) show them per number, and Dakly surfaces them per shop.

Build advice: do not build a generic CRUD admin over the database (for example by pointing a table editor at Postgres). Every admin action must go through domain services so that rules, ledgers and audit stay correct.

## Prototype screens

The admin panel has no prototype. Build it from this doc with the components in `packages/ui`.

## Engineering

### Release 1 scope

Shops list and detail; support access with the owner's consent; plans, prices, coupons and VAT rate; invoices, refunds, credits and balance adjustments; payment reconciliation queue; messaging providers and template status; AI usage and cost per shop with kill switches; abuse queue; feature flags; basic company metrics; staff accounts and audit log; announcements; data export and delete requests.

### How it works

1. Separate app at `admin.dakly.app` behind Cloudflare Access, with its own staff sessions.
2. Staff accounts are `staff_users`, never shop `users`. Passkey or TOTP is required.
3. Staff roles: support, finance, engineering, owner. Two-person approval for refunds over a limit, plan overrides and data deletion.
4. Staff read shop data only through a support grant: the shop Owner approves a request in the app; the grant names the scope (chats, orders, billing) and expires (default 24 hours). The shop sees a banner while staff are inside.
5. Admin queries for one shop run through `TenantDatabase.forStore` with the granted store id, so RLS still applies. The admin API never connects as a role that bypasses RLS.
6. Cross-store screens (shops list, usage totals, reconciliation) read from `SECURITY DEFINER` report functions or read-only views built for them (pending review must-fix), never by switching RLS off.
7. Every staff action goes through domain services (no generic table editor over the database) and writes `staff_audit_log` (append-only, kept 2 years) and the shop's own audit log when it touches a shop.

### Rules

1. No staff action without a matching audit row.
2. No shop data without an active support grant.
3. Kill switches (AI for one shop or everyone, SMS provider switch) take effect within one minute.

### Data

`staff_users`, `staff_sessions`, `support_grants`, `staff_approvals` (deferred by the schema review, pending), `staff_audit_log`, `feature_flags`, `plan_catalogue`, `whatsapp_rates`. All global, no `store_id`.

### Acceptance

- Given a support agent without a grant, when they open a shop's chats, then the API returns 403 and writes an audit row.
- Given MRR on the metrics page, then it equals the sum of active subscriptions to the taka.

## Open questions

None.
