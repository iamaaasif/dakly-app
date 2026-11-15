# Isolation and access

How the schema keeps one store's data away from another, and how the few paths that start without a store get in. The rules are in [multi-tenancy.md](../rules/multi-tenancy.md) and [database.md](../rules/database.md); this page records what the release 1 migration does. Each feature migration (0003 to 0013) holds its generated tables first, then the hand-written policies, grants and functions for those tables. Migration 0014 rebuilds the three partitioned tables, so their policies and grants are set there.

## Roles

| Role        | Used by                     | RLS                                                  |
| ----------- | --------------------------- | ---------------------------------------------------- |
| `dakly`     | Migrations, maintenance job | Owns the tables, so policies do not apply to it      |
| `dakly_app` | API, worker, admin app      | Not an owner, so every policy applies on every query |

No table uses `FORCE ROW LEVEL SECURITY` (schema review must-fix 3). With FORCE, every data migration as the owner would fail its policy checks. The integration test fails if any table turns FORCE on.

## Shop tables

Tenant child tables have `store_id` and one policy, `<table>_isolation`; `stores` itself uses its primary `id` as the tenant key:

```sql
USING (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid)
WITH CHECK (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid)
```

`TenantDatabase.forStore(storeId, ...)` sets `app.store_id` for the transaction. Outside `forStore` the setting is empty, the comparison is null, and the query sees no rows. `store-isolation.int.spec.ts` checks tenant-table RLS policies while explicitly excluding global outbox/staff audit records, so a table added later without one fails CI.

Foreign-key checks are not filtered by RLS. Tenant-owned parent links therefore have supplemental `(store_id, parent_id)` foreign keys against unique parent `(store_id, id)` keys. The original ID foreign key keeps its SET NULL or CASCADE behavior. A supplemental key paired with CASCADE also uses CASCADE, so ordinary cascading deletes work without deferral. A key paired with SET NULL instead uses NO ACTION to avoid clearing `store_id`; the hand-written part of each feature migration marks only these supplemental keys DEFERRABLE INITIALLY IMMEDIATE. This deferrability is SQL-only and is not represented by Drizzle. Normal inserts still reject cross-store links immediately. A purge/delete transaction that detaches SET NULL links sets `SET CONSTRAINTS ALL DEFERRED` before dependent cleanup/deletion and `SET CONSTRAINTS ALL IMMEDIATE` before commit, so validation sees the final state after delete actions and fails if any reference remains inconsistent. Nullable links may be null; non-null cross-store links are rejected by PostgreSQL. Global reference tables have their ordinary ID foreign keys. Services still load parents through the owning feature in a bounded batch to check permissions and business state; polymorphic IDs and JSON references need explicit ownership checks.

## Global tables

27 tables are global (the audit/outbox tables may carry a nullable store reference without being tenant tables): `users`, `sessions`, `account_security_events`, `account_recoveries`, `account_security_notices`, `push_subscriptions`, `outbox_events`, `webhook_events`, `bd_areas`, `plans`, `coupons`, `invoice_counters`, `staff_users`, `staff_sessions`, `staff_challenges`, `staff_passkeys`, `staff_identity_contacts`, `staff_user_links`, `staff_audit_exports`, `staff_alert_deliveries`, `staff_audit_log`, `platform_settings`, `maintenance_watermarks`, `staff_audit_log_days`, `abuse_reports`, `gateway_settlement_lines`, `platform_daily_metrics`. They hold sign-in records, reference data, the platform's own records, or rows written before the store is known. Only their owning features read them, by indexed keys. Account history is filtered by `user_id` from the authenticated session; it does not use a store or tenant RLS.

`support_sessions` and `support_grants` hold a `store_id` and has a policy like any shop table: a store can list the grants on itself, and the admin app reads a grant inside `forStore` for that store.

## Grants

Production has no default privileges, so each table's grant to `dakly_app` is written in a migration; 0025 states it for every table created before it. `store-isolation.int.spec.ts` fails for a table or view without one.

| Grant                           | Tables                                                                                                                                                                                | Why                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| No UPDATE or DELETE             | `account_security_events`, `audit_log`, `staff_audit_log`, `payment_events`, `wallet_ledger`, `stock_movements`, `usage_events`, `consents`, `ai_rule_changes`, `tracked_link_visits` | Records of what happened. A correction is a new row.                                            |
| SELECT, INSERT, UPDATE, DELETE  | `account_recoveries`, `account_security_notices`                                                                                                                                      | Mutable recovery workflow, delivery state and leases; account security events remain immutable. |
| No DELETE                       | `orders`, `invoices`, `payment_intents`, `refunds`, `automation_versions`, `tracked_link_visit_days`                                                                                  | Money and published workflows. Cancel, void or archive instead.                                 |
| UPDATE only `is_stopped`        | `automation_versions`                                                                                                                                                                 | Graph and publication fields stay immutable; the owner may stop old runs.                       |
| UPDATE only `status`, `paid_at` | `invoices`                                                                                                                                                                            | Settlement may change; document corrections use credit notes.                                   |
| DELETE allowed                  | `order_items`                                                                                                                                                                         | Editable-order removal must adjust stock, totals and audit atomically in OrdersService.         |
| INSERT only                     | `outbox_events`                                                                                                                                                                       | Global table; the relay reads it only through `claim_outbox_events` (must-fix 4).               |
| No DELETE                       | `webhook_events`                                                                                                                                                                      | Purged by `purge_webhook_events` after 7 days.                                                  |

`purge_account_security_events(batch_limit)` is an owner-only function, with EXECUTE revoked from PUBLIC and `dakly_app`. Each call deletes at most 1–1,000 rows strictly older than two years, using locked batches that skip rows another purge holds. It takes no caller-supplied cutoff. The user and staff foreign keys have no delete cascade, so removing an account cannot erase retained history. DB-7 will schedule these calls in the owner maintenance step.

Retention purges run as `dakly`, never through the app role. Staff audit rows and daily seals have a minimum seven-year retention policy; ADM-2 provides no purge, retaining them indefinitely. An eventual purge must preserve enough chain evidence for retained-day verification.

`audit_log`, `ai_runs` and `tracked_link_visits` are partitioned by month ([growth.md](growth.md)). The policy and grants are on the parent, and every query goes through it. Each monthly partition has RLS on and no grants for `dakly_app`, so the app cannot read a partition directly and skip the policy. `store-isolation.int.spec.ts` checks both.

Sending reads consent only through the view `contact_consent_current` (latest row per contact and channel). It is `security_invoker`, so RLS applies to the caller.

## Ways in without a store

Some work starts before the store is known: a webhook names a page id, a payment callback names a reference, a public order page names a slug, a sign-in names a user. Sweeps that find due work look across stores. Each of these goes through one small `SECURITY DEFINER` function that returns only the identifiers or narrow fields listed below. The caller then does the real work inside `forStore` for each returned store.

Every definer function sets `search_path = pg_catalog, public, pg_temp`, so temporary relations cannot shadow trusted relations. New/revised function bodies qualify persistent relations with `public`. EXECUTE is revoked from PUBLIC and granted to `dakly_app`; the app cannot create objects in `public`. Regression tests use a conflicting temporary relation and check grants and path order. Merely setting a search path without explicitly placing `pg_temp` last is insufficient.

| Function                                      | Returns                                                                                      | Caller                                                 |
| --------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `store_id_for_channel_account(kind, account)` | store of a connected page, number or account                                                 | Webhook intake (Meta, WhatsApp)                        |
| `store_id_for_slug(slug)`                     | store for a public page                                                                      | Order link page, opt-out page                          |
| `payment_intent_for_reference(reference)`     | store and payment intent                                                                     | Payment callbacks and gateway webhooks                 |
| `tracked_link_for_code(code)`                 | store and tracked link                                                                       | Link redirect, SMS opt-out link                        |
| `store_id_for_provider_message(id)`           | store of a sent campaign or workflow message                                                 | Delivery and read receipts                             |
| `stores_for_user(user)`                       | the user's stores and roles                                                                  | Sign-in, store switcher                                |
| `membership_for_invite(token hash)`           | store and membership                                                                         | Accepting a team invite                                |
| `claim_outbox_events(limit)`                  | claimed events (locks with SKIP LOCKED)                                                      | Outbox relay                                           |
| `mark_outbox_events_published(ids)`           | count                                                                                        | Outbox relay                                           |
| `purge_published_outbox_events(before)`       | count                                                                                        | Maintenance job                                        |
| `purge_webhook_events(before)`                | count                                                                                        | Maintenance job                                        |
| `due_automation_runs(limit)`                  | due waits or running claims stale for five minutes                                           | Workflow sweeper                                       |
| `due_campaigns(as_of)`                        | scheduled campaigns now due                                                                  | Campaign sweeper                                       |
| `due_post_targets(as_of)`                     | scheduled posts now due                                                                      | Social sweeper                                         |
| `due_post_metrics(limit)`                     | published posts due a metrics refresh                                                        | Social metrics job                                     |
| `due_payment_checks(limit)`                   | pending payments due a status check                                                          | Payment reconciliation                                 |
| `due_subscription_renewals(as_of)`            | subscriptions due to renew                                                                   | Billing renewal job                                    |
| `trials_ending_before(before)`                | trials ending soon                                                                           | Trial reminder job                                     |
| `channel_connections_expiring_before(before)` | tokens close to expiry                                                                       | Token check job                                        |
| `due_conversation_returns(limit)`             | chats whose "return to AI" time passed                                                       | Chats sweeper                                          |
| `due_contact_purges(limit)`                   | contacts deleted more than 30 days ago                                                       | Purge job                                              |
| `active_store_ids()`                          | stores with status `active`                                                                  | Active-store fan-outs; never retention rollups         |
| `maintenance_store_ids(after, limit)`         | IDs of all retained stores, including suspended and closing, in UUID order; pages of 1–1,000 | Retention rollups before the global watermark advances |
| `support_store_targets(search)`               | exact shop ID/name lookup by UUID or slug                                                    | Authenticated support request screen                   |
| `support_request_metadata(staff, before)`     | fifty-one requester-owned grant metadata rows in ID order (0026)                             | Staff support screen; no customer content              |
| `support_grant_store(staff, grant)`           | requester-owned grant's store ID                                                             | Approved handoff                                       |
| `support_session_store(hash, handoff)`        | token-bound store ID only                                                                    | Support session exchange/resolution                    |
| `staff_conflicts_with_store(staff, store)`    | whether an established linked user is an active member                                       | Support authorization                                  |
| `seal_staff_audit_day()`                      | one completed UTC day, or null when caught up                                                | Audit worker; no shop content                          |
| `admin_store_overview(search, limit)`         | store name, plan, status, member count                                                       | Admin stores list (metadata only)                      |
| `ensure_monthly_partitions(months_ahead)`     | number of partitions created                                                                 | Maintenance job                                        |
| `drop_expired_partitions()`                   | number of AI run and link visit months dropped                                               | Maintenance job; never drops audit months              |

Prefer a job that carries its `storeId` (a delayed BullMQ job per item) over a sweep. Sweeps exist as the safety net for jobs lost in Valkey and for work that is due by time.

## Staff access

The admin app connects as `dakly_app` like the shop app. It never bypasses RLS.

- Platform screens (stores list, plans, coupons, settings) read global tables and `admin_store_overview`, which returns metadata and counts, no customer or order content.
- Opening one store's data needs a `support_grants` row: requested by staff, approved by the shop owner from inside the shop app, read or write, with an expiry. The admin service checks the grant, then reads inside `forStore` for that store. Every read and write is written to `staff_audit_log` with a reason.
- Risky actions (store deletion, large refunds or credits, bulk price changes, global AI pause, break-glass) need one staff member with the right role, a reason and a confirmation; no second approver (D28). They all run through one admin service method that writes `staff_audit_log` before the change and fails if that write fails. Two-person approval, if wanted later, is a table and a check in that one method; the audit record stays as it is.

## Customer identity (D26, D27)

The schema keeps the buyer and the delivery recipient apart, and nothing merges contacts on its own:

- `orders.buyer_contact_id` is the buyer while the profile exists. `buyer_name` snapshots that buyer independently of the recipient; unknown names remain null. Purge sets both the buyer and originating conversation links to null and keeps permitted order history.
- `orders.recipient_name`, `recipient_phone`, `recipient_address`, `recipient_district`, `recipient_bd_area_id` are a snapshot of who receives it. `orders.is_recipient_buyer` says whether that is the buyer (the default).
- `contacts.phone` is the person's own phone, one contact per phone per store (partial unique index `contacts_store_id_phone_key`). It is saved when the buyer gives it for an order to themselves, including during chat capture before the order exists (D27), from a WhatsApp sender identity (then `phone_verified_at` is set), from an import, or by a staff edit. Once set, only a direct profile edit changes it. Saving it is not verification, not a merge and not marketing consent.
- If the phone already belongs to another contact, the unique index refuses the save (also when two saves race). The service keeps the phone on the order only and writes a `contact_match_suggestions` row (`reason = same_phone`, with `order_id` or `conversation_id`). Staff merge or dismiss it; the order is never blocked.
- A phone for another recipient (`is_recipient_buyer = false`) stays only on the order and never touches a contact.
- Return risk is read from `orders` by `recipient_phone` (index `orders_store_id_recipient_phone_outcome_idx`), so it follows the delivery phone, not the contact.
- AI order tools read only orders of this conversation or of a WhatsApp-verified identity (must-fix 1). A saved but unverified phone gives no access to other orders.
- Customer memory (`contact_memories`, D30) is keyed by contact and store and sits under RLS like any shop table. It holds only what this customer said or their own orders show; a self-delivery order's area may be used, another recipient's never (D26). It never links contacts, and merge or undo invalidates both affected memories and conversation checkpoints. Clear cutoffs survive rebuilding; older model responses must fail version guards.
- `kind = customer` includes both a non-cancelled order and an intentional manual/import/store-sync/POS/khata customer under the glossary. Cancelling the last order preserves intentional customers; other contacts become leads only with their own phone, otherwise `chat_only`. `not_customer` stays an explicit staff choice.

## Merge history and erasure

`contact_merges.operation_key` remains unique per store after undo or redaction. Before-images, moved IDs and `after_state` support field-level conflict checks, not blind restoration. Undo preserves later edits and withdrawals, records conflicts and rejects a merge with active dependent merges. Consent history is never reassigned: merge and undo append conservative decisions. `ai_rule_changes` is append-only authoritative undo evidence; `audit_log` records the event timeline rather than duplicating every rule image.

Customer purge requires a privileged, narrowly authorized maintenance path because chat messages, consent and other history cannot be freely erased by the app. It defers the affected reference checks as described above, stops pending work, clears memory, deletes chat dependents and customer-linked records, redacts merge images/conflicts and personal payloads, and preserves the opaque operation key. `evidence_redacted_at` disables merge undo. Audit/outbox/job payloads and stored files need the same erasure treatment. The schema supports detachment and cascades; the purge service and tests for complete erasure remain planned. See the detailed [customer contract](../features/03-customers-and-segments.md).

The restricted `preserve_staff_user_identity()` trigger records verified contact matches in `staff_user_links` on user/contact changes and retains old matches. It is not directly executable by the app. `stamp_staff_audit()` controls insert timestamps; `staff_audit_day_hash(day, previous)` streams one day for sealing and verification. These functions explicitly place `pg_temp` last.

## Break-glass alert delivery

`staff_alert_deliveries` is global delivery state keyed by `staff_audit_log.id`, with no copied shop/customer payload and no invented shop-user identity. Intent joins the active tenant transaction through `recordIntent`; failure rolls back both audits and the grant. The admin-home reader joins authoritative staff audit events, checks a current Super admin session under staff locks, and paginates at 50 rows using the action/time/ID audit index. The pending partial index bounds the relay to twenty due events and terminal crash cleanup to one hundred rows. The app may select/insert/update delivery state; the staff audit remains append-only.

The existing `support_request_metadata` definer additionally returns `isBreakGlass`; its exact staff-ID filter, row limit (fifty-one since 0026, one past the page), qualified tables, fixed search path and restricted execution remain in force. No new cross-tenant definer or bypass role was added. The alert worker payload contains only the global audit ID, deliberately no fabricated store ID, like existing staff audit exports.

### Staff account recovery

`staff_recovery_history` holds only the shop and canonical staff-audit reference,
with their pair as its primary key. The safe history projection reads the subject,
reason type and event time from that immutable audit. It has tenant RLS and
read-only app grants.
`staff_recovery_stores` returns a bounded snapshot of at most 100 shops and 1,000
Owners, locking shops in ID order after the account row is locked. It refreshes
active memberships after any store-lock wait before deriving conflicts, recipients
and history mappings. Overflow returns
a marker before acquiring an unbounded lock set. `record_staff_recovery_history`
inserts mappings from the persisted account recovery audit and current memberships,
using the canonical action UUID v7 as the cursor. Both narrow functions set
`search_path = pg_catalog, public, pg_temp`, revoke PUBLIC execution and grant only
`dakly_app`. The write joins the active account transaction; it never starts nested
store actions. Read routes take shop identity only from the authenticated session
and require the current Owner.

Account security decisions hold `FOR NO KEY UPDATE` on the user. This still
serializes account writers and conflicts with invitation/store-creation identity
`FOR SHARE` locks, but permits staff association foreign-key `KEY SHARE` checks.
Before updating a phone or email, recovery and email change acquire all verified
old and candidate contact advisory locks in kind/value order. Staff provisioning
prelocks its normalized contact batch with the same PostgreSQL `ORDER BY kind,value`
as recovery, auth and the identity trigger, using the database collation. Recovery reads committed
identity associations after the advisory locks. Stronger contact-update locks thus
cannot form a cycle with association insertion; the user primary key, foreign keys
and durable identity triggers remain unchanged.
