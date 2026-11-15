-- Production has no default privileges for dakly_app, so every table states its grant here.
-- These match what local and CI databases already had: full access, minus the earlier REVOKEs
-- on append-only and limited tables. Column grants on invoices and automation_versions (0005,
-- 0012) already apply. Partition children and platform_daily_metrics stay without access.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  account_recoveries, account_security_notices, ai_agent_settings, ai_runs, assistant_messages,
  automation_run_steps, automation_runs, automations, bd_areas, brand_profiles,
  campaign_recipients, campaigns, channel_connections, contact_identities,
  contact_match_suggestions, contact_memories, contact_merges, contact_stats, contacts,
  content_pieces, conversations, coupons, customer_insights, customers, data_requests,
  delivery_zones, discount_codes, files, imports, invoice_counters, knowledge_chunks,
  knowledge_items, memberships, messages, notifications, order_items, ownership_transfers,
  payment_gateway_credentials, plans, platform_settings, post_targets, posts, product_variants,
  products, push_subscriptions, restock_requests, roles, saved_replies, segments, sessions,
  sms_messages, sms_sender_ids, social_comments, staff_alert_deliveries, staff_audit_exports,
  staff_challenges, staff_identity_contacts, staff_passkeys, staff_sessions, staff_users,
  store_counters, store_daily_metrics, stores, subscription_items, subscriptions, support_grants,
  support_sessions, tasks, tracked_links, users, whatsapp_templates
TO dakly_app;
--> statement-breakpoint
-- Rows that are kept as records: no DELETE.
GRANT SELECT, INSERT, UPDATE ON
  abuse_reports, gateway_settlement_lines, maintenance_watermarks, orders, payment_intents,
  refunds, tracked_link_visit_days, webhook_events
TO dakly_app;
--> statement-breakpoint
-- Append-only history, ledgers and evidence: no UPDATE or DELETE.
GRANT SELECT, INSERT ON
  account_security_events, ai_rule_changes, audit_log, automation_versions, consents, invoices,
  payment_events, staff_audit_log, staff_user_links, stock_movements, tracked_link_visits,
  usage_events, wallet_ledger
TO dakly_app;
--> statement-breakpoint
-- Written only by SECURITY DEFINER functions.
GRANT SELECT ON staff_audit_log_days, staff_recovery_history TO dakly_app;
--> statement-breakpoint
-- The relay claims outbox rows through a function; the app only adds them.
GRANT INSERT ON outbox_events TO dakly_app;
--> statement-breakpoint
-- The view cannot be written; local defaults had granted writes that could never succeed.
REVOKE INSERT, UPDATE, DELETE ON contact_consent_current FROM dakly_app;
