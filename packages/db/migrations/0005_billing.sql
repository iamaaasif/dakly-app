CREATE TABLE "coupons" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" "citext" NOT NULL,
	"kind" text NOT NULL,
	"discount_percent" integer,
	"discount_amount_poisha" bigint,
	"plan_codes" text[],
	"valid_from" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone,
	"max_redemptions" integer,
	"redemption_count" integer DEFAULT 0 NOT NULL,
	"created_by_staff_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coupons_kind" CHECK ("coupons"."kind" in ('percent', 'amount')),
	CONSTRAINT "coupons_value" CHECK (("coupons"."kind" = 'percent' and "coupons"."discount_percent" between 1 and 100 and "coupons"."discount_amount_poisha" is null) or ("coupons"."kind" = 'amount' and "coupons"."discount_amount_poisha" > 0 and "coupons"."discount_percent" is null)),
	CONSTRAINT "coupons_redemptions" CHECK ("coupons"."max_redemptions" is null or "coupons"."redemption_count" <= "coupons"."max_redemptions")
);
--> statement-breakpoint
CREATE TABLE "invoice_counters" (
	"financial_year" text PRIMARY KEY NOT NULL,
	"next_number" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"number" text NOT NULL,
	"financial_year" text NOT NULL,
	"kind" text DEFAULT 'invoice' NOT NULL,
	"credited_invoice_id" uuid,
	"lines" jsonb NOT NULL,
	"bill_to" jsonb NOT NULL,
	"subtotal_poisha" bigint NOT NULL,
	"vat_rate_basis_points" integer NOT NULL,
	"vat_poisha" bigint NOT NULL,
	"total_poisha" bigint NOT NULL,
	"coupon_id" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_kind" CHECK ("invoices"."kind" in ('invoice', 'credit_note')),
	CONSTRAINT "invoices_status" CHECK ("invoices"."status" in ('open', 'paid', 'void')),
	CONSTRAINT "invoices_credit_note" CHECK (("invoices"."kind" = 'credit_note') = ("invoices"."credited_invoice_id" is not null)),
	CONSTRAINT "invoices_total" CHECK ("invoices"."total_poisha" = "invoices"."subtotal_poisha" + "invoices"."vat_poisha")
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"kind" text DEFAULT 'plan' NOT NULL,
	"name" text NOT NULL,
	"monthly_price_poisha" bigint NOT NULL,
	"yearly_price_poisha" bigint NOT NULL,
	"limits" jsonb NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_kind" CHECK ("plans"."kind" in ('plan', 'add_on')),
	CONSTRAINT "plans_prices" CHECK ("plans"."monthly_price_poisha" >= 0 and "plans"."yearly_price_poisha" >= 0)
);
--> statement-breakpoint
CREATE TABLE "subscription_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"current_period_price_poisha" bigint NOT NULL,
	"pending_price_poisha" bigint,
	"price_change_starts_at" timestamp with time zone,
	"started_at" timestamp with time zone NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_items_status" CHECK ("subscription_items"."status" in ('active', 'cancelled')),
	CONSTRAINT "subscription_items_price_change" CHECK (("subscription_items"."pending_price_poisha" is null) = ("subscription_items"."price_change_starts_at" is null)),
	CONSTRAINT "subscription_items_prices" CHECK ("subscription_items"."current_period_price_poisha" >= 0 and coalesce("subscription_items"."pending_price_poisha", 0) >= 0)
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"billing_cycle" text DEFAULT 'monthly' NOT NULL,
	"status" text NOT NULL,
	"current_period_price_poisha" bigint NOT NULL,
	"pending_price_poisha" bigint,
	"price_change_notified_at" timestamp with time zone,
	"price_change_starts_at" timestamp with time zone,
	"trial_ends_at" timestamp with time zone,
	"current_period_start" timestamp with time zone NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"is_cancellation_scheduled" boolean DEFAULT false NOT NULL,
	"pending_plan_id" uuid,
	"renewal_method" text DEFAULT 'pay_link' NOT NULL,
	"bkash_agreement_ciphertext" "bytea",
	"bkash_agreement_key_version" smallint,
	"past_due_since" timestamp with time zone,
	"renewal_attempts" smallint DEFAULT 0 NOT NULL,
	"next_renewal_attempt_at" timestamp with time zone,
	"read_only_since" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_price_change" CHECK (("subscriptions"."pending_price_poisha" is null) = ("subscriptions"."price_change_starts_at" is null) and coalesce("subscriptions"."pending_price_poisha", 0) >= 0),
	CONSTRAINT "subscriptions_billing_cycle" CHECK ("subscriptions"."billing_cycle" in ('monthly', 'yearly')),
	CONSTRAINT "subscriptions_status" CHECK ("subscriptions"."status" in ('trialing', 'active', 'past_due', 'read_only', 'cancelled')),
	CONSTRAINT "subscriptions_renewal_method" CHECK ("subscriptions"."renewal_method" in ('bkash_agreement', 'pay_link'))
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"unit" text NOT NULL,
	"quantity" integer NOT NULL,
	"source" text NOT NULL,
	"reference" text NOT NULL,
	"period_start" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_events_unit" CHECK ("usage_events"."unit" in ('ai_conversation', 'ai_content', 'ai_ask')),
	CONSTRAINT "usage_events_source" CHECK ("usage_events"."source" in ('allowance', 'top_up')),
	CONSTRAINT "usage_events_quantity" CHECK ("usage_events"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "wallet_ledger" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"wallet" text NOT NULL,
	"revision" integer NOT NULL,
	"kind" text NOT NULL,
	"quantity_delta" bigint NOT NULL,
	"balance_quantity_after" bigint NOT NULL,
	"reference_type" text,
	"reference_id" uuid,
	"idempotency_key" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_user_id" uuid,
	"actor_staff_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_ledger_wallet" CHECK ("wallet_ledger"."wallet" in ('whatsapp_poisha', 'sms_credits', 'ai_conversations')),
	CONSTRAINT "wallet_ledger_kind" CHECK ("wallet_ledger"."kind" in ('top_up', 'charge', 'reserve', 'release', 'refund', 'adjustment', 'expiry')),
	CONSTRAINT "wallet_ledger_actor_type" CHECK ("wallet_ledger"."actor_type" in ('user', 'ai', 'system', 'staff', 'customer')),
	CONSTRAINT "wallet_ledger_quantity" CHECK ("wallet_ledger"."quantity_delta" <> 0),
	CONSTRAINT "wallet_ledger_balance" CHECK ("wallet_ledger"."balance_quantity_after" >= 0),
	CONSTRAINT "wallet_ledger_revision" CHECK ("wallet_ledger"."revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_store_id_id_key" ON "invoices" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "plans_code_key" ON "plans" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_items_active_key" ON "subscription_items" USING btree ("subscription_id","plan_id") WHERE "subscription_items"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_store_id_key" ON "subscriptions" USING btree ("store_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_store_id_id_key" ON "subscriptions" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_events_reference_key" ON "usage_events" USING btree ("store_id","unit","reference");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_ledger_store_id_idempotency_key_key" ON "wallet_ledger" USING btree ("store_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_ledger_store_id_wallet_revision_key" ON "wallet_ledger" USING btree ("store_id","wallet","revision");--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_created_by_staff_id_staff_users_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_credited_invoice_id_invoices_id_fk" FOREIGN KEY ("credited_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_credits_invoice_id_store_fk" FOREIGN KEY ("store_id","credited_invoice_id") REFERENCES "public"."invoices"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_items" ADD CONSTRAINT "subscription_items_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_items" ADD CONSTRAINT "subscription_items_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_items" ADD CONSTRAINT "subscription_items_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_items" ADD CONSTRAINT "subscription_items_subscription_id_store_fk" FOREIGN KEY ("store_id","subscription_id") REFERENCES "public"."subscriptions"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_pending_plan_id_plans_id_fk" FOREIGN KEY ("pending_plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_ledger" ADD CONSTRAINT "wallet_ledger_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_ledger" ADD CONSTRAINT "wallet_ledger_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_ledger" ADD CONSTRAINT "wallet_ledger_actor_staff_id_staff_users_id_fk" FOREIGN KEY ("actor_staff_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coupons_created_by_staff_id_idx" ON "coupons" USING btree ("created_by_staff_id");--> statement-breakpoint
CREATE INDEX "invoices_store_id_issued_at_idx" ON "invoices" USING btree ("store_id","issued_at");--> statement-breakpoint
CREATE INDEX "invoices_credited_invoice_id_idx" ON "invoices" USING btree ("credited_invoice_id");--> statement-breakpoint
CREATE INDEX "invoices_coupon_id_idx" ON "invoices" USING btree ("coupon_id");--> statement-breakpoint
CREATE INDEX "subscription_items_store_id_idx" ON "subscription_items" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "subscription_items_plan_id_idx" ON "subscription_items" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "subscriptions_plan_id_idx" ON "subscriptions" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "subscriptions_pending_plan_id_idx" ON "subscriptions" USING btree ("pending_plan_id");--> statement-breakpoint
CREATE INDEX "subscriptions_renewal_due_idx" ON "subscriptions" USING btree ("next_renewal_attempt_at") WHERE "subscriptions"."next_renewal_attempt_at" is not null;--> statement-breakpoint
CREATE INDEX "subscriptions_trial_ends_at_idx" ON "subscriptions" USING btree ("trial_ends_at") WHERE "subscriptions"."status" = 'trialing';--> statement-breakpoint
CREATE INDEX "usage_events_period_idx" ON "usage_events" USING btree ("store_id","unit","period_start");--> statement-breakpoint
CREATE INDEX "wallet_ledger_actor_user_id_idx" ON "wallet_ledger" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "wallet_ledger_actor_staff_id_idx" ON "wallet_ledger" USING btree ("actor_staff_id");--> statement-breakpoint

-- Written by hand below this line (docs/rules/database.md, Migrations step 2). Row level
-- security: a connection sees and writes only the rows of the store set by
-- TenantDatabase.forStore. See docs/data/isolation-and-access.md.
ALTER TABLE "subscription_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "subscription_items_isolation" ON "subscription_items"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "invoices_isolation" ON "invoices"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "subscriptions_isolation" ON "subscriptions"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "usage_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "usage_events_isolation" ON "usage_events"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "wallet_ledger" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "wallet_ledger_isolation" ON "wallet_ledger"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint

-- Ledgers are append-only: a correction is a new row.
REVOKE UPDATE, DELETE ON "wallet_ledger", "usage_events" FROM dakly_app;--> statement-breakpoint
-- An issued invoice is never removed; it is voided or credited.
REVOKE DELETE ON "invoices" FROM dakly_app;--> statement-breakpoint
-- An invoice may only be paid or voided, never re-priced.
REVOKE UPDATE ON "invoices" FROM dakly_app;--> statement-breakpoint
GRANT UPDATE ("status", "paid_at") ON "invoices" TO dakly_app;--> statement-breakpoint
CREATE FUNCTION due_subscription_renewals(p_as_of timestamptz) RETURNS TABLE(store_id uuid, subscription_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT store_id, id FROM subscriptions WHERE next_renewal_attempt_at <= p_as_of
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION due_subscription_renewals(timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION due_subscription_renewals(timestamptz) TO dakly_app;--> statement-breakpoint
CREATE FUNCTION trials_ending_before(p_before timestamptz) RETURNS TABLE(store_id uuid, subscription_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT store_id, id FROM subscriptions WHERE status = 'trialing' AND trial_ends_at <= p_before
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION trials_ending_before(timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION trials_ending_before(timestamptz) TO dakly_app;--> statement-breakpoint
CREATE FUNCTION admin_store_overview(p_search text, p_limit integer) RETURNS TABLE(store_id uuid, name text, slug text, status text, plan_code text, subscription_status text, members integer, created_at timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  -- Shop metadata only: no customer, message or secret data crosses stores here.
  SELECT s.id, s.name, s.slug, s.status, p.code, sub.status,
    (SELECT count(*)::integer FROM memberships m WHERE m.store_id = s.id AND m.status = 'active'),
    s.created_at
  FROM stores s
  LEFT JOIN subscriptions sub ON sub.store_id = s.id
  LEFT JOIN plans p ON p.id = sub.plan_id
  WHERE p_search IS NULL OR s.name ILIKE '%' || p_search || '%' OR s.slug = p_search
  ORDER BY s.created_at DESC
  LIMIT p_limit
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION admin_store_overview(text, integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION admin_store_overview(text, integer) TO dakly_app;--> statement-breakpoint
