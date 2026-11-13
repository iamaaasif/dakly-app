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

## Release 1 scope

Shops list and detail; support access with the owner's consent; plans, prices, coupons and VAT rate; invoices, refunds, credits and balance adjustments; payment reconciliation queue; messaging providers and template status; AI usage and cost per shop with kill switches; abuse queue; feature flags; basic company metrics; staff accounts and audit log; announcements; data export and delete requests.

## How it works

1. Separate app at `admin.dakly.app` behind Cloudflare Access, with its own staff sessions.
2. Staff accounts are `staff_users`, never shop `users`. Passkey or TOTP is required.
3. Staff roles: support, finance, engineering, owner. Two-person approval for refunds over a limit, plan overrides and data deletion.
4. Staff read shop data only through a support grant: the shop Owner approves a request in the app; the grant names the scope (chats, orders, billing) and expires (default 24 hours). The shop sees a banner while staff are inside.
5. Admin queries for one shop run through `TenantDatabase.forStore` with the granted store id, so RLS still applies. The admin API never connects as a role that bypasses RLS.
6. Cross-store screens (shops list, usage totals, reconciliation) read from `SECURITY DEFINER` report functions or read-only views built for them (pending review must-fix), never by switching RLS off.
7. Every staff action goes through domain services (no generic table editor over the database) and writes `staff_audit_log` (append-only, kept 2 years) and the shop's own audit log when it touches a shop.

## Rules

1. No staff action without a matching audit row.
2. No shop data without an active support grant.
3. Kill switches (AI for one shop or everyone, SMS provider switch) take effect within one minute.

## Data

`staff_users`, `staff_sessions`, `support_grants`, `staff_approvals` (deferred by the schema review, pending), `staff_audit_log`, `feature_flags`, `plan_catalogue`, `whatsapp_rates`. All global, no `store_id`.

## Acceptance

- Given a support agent without a grant, when they open a shop's chats, then the API returns 403 and writes an audit row.
- Given MRR on the metrics page, then it equals the sum of active subscriptions to the taka.
