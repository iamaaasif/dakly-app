# 0006: Keep history on the parent row or in the audit log

- Status: proposed
- Date: 2026-11-13

## Context

The release 1 spec had a history table for nearly every entity: order stage events, contact touches, usage totals, post metrics, campaign stats. The schema review (Q10) counted 78 tables and found that most of these only ever answer "what is the latest value" or "show a timeline on one page".

## Decision

- Order and conversation timelines read `audit_log` by `(store_id, entity_type, entity_id, created_at)`. There is no `order_stage_events` table.
- Attribution is columns on `orders` (`attributed_source_type`, `attributed_source_id`, `attributed_touch_at`). There is no touches table; frequency caps read `campaign_recipients` and `automation_run_steps`.
- Usage totals are summed from `usage_events` for the period; post metrics and campaign counts are columns on `post_targets` and `campaigns`, overwritten on refresh.
- Tables that are records of money or stock (`payment_events`, `wallet_ledger`, `stock_movements`) stay separate and append-only, because their rows are the source of truth.

## Consequences

67 tables instead of 78, and fewer writes per action. Reports that need history over time read `store_daily_metrics`, built nightly. If a screen needs a metric's history (for example post reach by day), that is a new summary table, not a revival of the event table.
