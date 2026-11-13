CREATE TABLE "delivery_zones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"name" text NOT NULL,
	"charge_poisha" bigint NOT NULL,
	"bd_area_ids" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_zones_charge" CHECK ("delivery_zones"."charge_poisha" >= 0)
);
--> statement-breakpoint
CREATE TABLE "discount_codes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"code" "citext" NOT NULL,
	"kind" text NOT NULL,
	"discount_percent" integer,
	"discount_amount_poisha" bigint,
	"minimum_order_poisha" bigint,
	"source_type" text NOT NULL,
	"source_id" uuid,
	"contact_id" uuid,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone,
	"max_redemptions" integer,
	"redemption_count" integer DEFAULT 0 NOT NULL,
	"is_disabled" boolean DEFAULT false NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discount_codes_kind" CHECK ("discount_codes"."kind" in ('percent', 'amount', 'free_delivery')),
	CONSTRAINT "discount_codes_source_type" CHECK ("discount_codes"."source_type" in ('manual', 'campaign', 'automation')),
	CONSTRAINT "discount_codes_value" CHECK (("discount_codes"."kind" = 'percent' and "discount_codes"."discount_percent" between 1 and 100 and "discount_codes"."discount_amount_poisha" is null) or ("discount_codes"."kind" = 'amount' and "discount_codes"."discount_amount_poisha" > 0 and "discount_codes"."discount_percent" is null) or ("discount_codes"."kind" = 'free_delivery' and "discount_codes"."discount_percent" is null and "discount_codes"."discount_amount_poisha" is null)),
	CONSTRAINT "discount_codes_redemptions" CHECK ("discount_codes"."max_redemptions" is null or "discount_codes"."redemption_count" <= "discount_codes"."max_redemptions")
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"product_name" text NOT NULL,
	"variant_title" text NOT NULL,
	"quantity" integer NOT NULL,
	"delivered_quantity" integer,
	"unit_price_poisha" bigint NOT NULL,
	"unit_cost_poisha" bigint,
	"line_discount_poisha" bigint DEFAULT 0 NOT NULL,
	"is_stock_tracked" boolean NOT NULL,
	"is_oversell_allowed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_quantity" CHECK ("order_items"."quantity" > 0 and coalesce("order_items"."delivered_quantity", 0) between 0 and "order_items"."quantity"),
	CONSTRAINT "order_items_money" CHECK ("order_items"."unit_price_poisha" > 0 and "order_items"."line_discount_poisha" >= 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"buyer_name" text,
	"buyer_contact_id" uuid,
	"conversation_id" uuid,
	"source" text NOT NULL,
	"created_by_type" text NOT NULL,
	"created_by_user_id" uuid,
	"is_recipient_buyer" boolean DEFAULT true NOT NULL,
	"recipient_name" text NOT NULL,
	"recipient_phone" text NOT NULL,
	"recipient_address" text NOT NULL,
	"recipient_district" text NOT NULL,
	"recipient_bd_area_id" integer,
	"delivery_zone_id" uuid,
	"stage" text DEFAULT 'to_confirm' NOT NULL,
	"on_hold_reason" text,
	"follow_up_on" date,
	"cancel_reason" text,
	"return_reason" text,
	"payment_status" text DEFAULT 'cod_pending' NOT NULL,
	"items_subtotal_poisha" bigint NOT NULL,
	"order_discount_poisha" bigint DEFAULT 0 NOT NULL,
	"discount_code_id" uuid,
	"delivery_charge_poisha" bigint DEFAULT 0 NOT NULL,
	"is_delivery_charge_overridden" boolean DEFAULT false NOT NULL,
	"advance_paid_poisha" bigint DEFAULT 0 NOT NULL,
	"cod_amount_poisha" bigint NOT NULL,
	"cod_collected_poisha" bigint,
	"courier" text,
	"courier_other_name" text,
	"tracking_code" text,
	"courier_charge_poisha" bigint,
	"cod_fee_poisha" bigint,
	"confirmation_method" text,
	"confirmed_at" timestamp with time zone,
	"shipped_at" timestamp with time zone,
	"shipped_by_user_id" uuid,
	"delivered_at" timestamp with time zone,
	"returned_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cod_collected_at" timestamp with time zone,
	"attributed_source_type" text,
	"attributed_source_id" uuid,
	"attributed_channel" text,
	"attributed_touch_at" timestamp with time zone,
	"possible_duplicate_of_order_id" uuid,
	"note" text,
	"external_ref" text,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_source" CHECK ("orders"."source" in ('messenger', 'instagram', 'whatsapp', 'comment', 'order_link', 'manual', 'pos_csv', 'shopify', 'woocommerce')),
	CONSTRAINT "orders_created_by_type" CHECK ("orders"."created_by_type" in ('ai', 'user', 'customer', 'sync')),
	CONSTRAINT "orders_stage" CHECK ("orders"."stage" in ('to_confirm', 'on_hold', 'to_pack', 'with_courier', 'delivered', 'partially_delivered', 'returned', 'cancelled')),
	CONSTRAINT "orders_payment_status" CHECK ("orders"."payment_status" in ('cod_pending', 'advance_requested', 'advance_paid', 'paid', 'cod_collected', 'refund_due', 'refunded')),
	CONSTRAINT "orders_on_hold_reason" CHECK (("orders"."stage" = 'on_hold') = ("orders"."on_hold_reason" is not null)),
	CONSTRAINT "orders_cancel_reason" CHECK (("orders"."stage" = 'cancelled') = ("orders"."cancel_reason" is not null)),
	CONSTRAINT "orders_courier" CHECK ("orders"."courier" in ('steadfast', 'pathao', 'redx', 'own_delivery', 'other')),
	CONSTRAINT "orders_confirmation_method" CHECK ("orders"."confirmation_method" in ('whatsapp_reply', 'sms_link', 'chat_reply', 'staff', 'advance_paid')),
	CONSTRAINT "orders_attributed_source_type" CHECK ("orders"."attributed_source_type" in ('campaign', 'automation', 'post')),
	CONSTRAINT "orders_recipient_phone_format" CHECK ("orders"."recipient_phone" ~ '^01[3-9][0-9]{8}$'),
	CONSTRAINT "orders_money" CHECK ("orders"."items_subtotal_poisha" >= 0 and "orders"."order_discount_poisha" >= 0 and "orders"."delivery_charge_poisha" >= 0 and "orders"."advance_paid_poisha" >= 0 and "orders"."cod_amount_poisha" >= 0),
	CONSTRAINT "orders_number" CHECK ("orders"."number" > 0)
);
--> statement-breakpoint
CREATE TABLE "gateway_settlement_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"gateway" text NOT NULL,
	"settlement_date" date NOT NULL,
	"gateway_transaction_id" text NOT NULL,
	"amount_poisha" bigint NOT NULL,
	"fee_poisha" bigint DEFAULT 0 NOT NULL,
	"report_file_id" uuid,
	"payment_intent_id" uuid,
	"status" text DEFAULT 'unmatched' NOT NULL,
	"matched_by_staff_id" uuid,
	"note" text,
	"matched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gateway_settlement_lines_gateway" CHECK ("gateway_settlement_lines"."gateway" in ('bkash', 'nagad', 'city_bank')),
	CONSTRAINT "gateway_settlement_lines_status" CHECK ("gateway_settlement_lines"."status" in ('matched', 'unmatched', 'gateway_error', 'refunded', 'escalated')),
	CONSTRAINT "gateway_settlement_lines_amounts" CHECK ("gateway_settlement_lines"."amount_poisha" > 0 and "gateway_settlement_lines"."fee_poisha" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"payment_intent_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"gateway_reference" text,
	"event_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_events_kind" CHECK ("payment_events"."kind" in ('created', 'sent', 'opened', 'redirected', 'callback', 'verified', 'status_changed', 'refund_requested', 'refund_result', 'dispute'))
);
--> statement-breakpoint
CREATE TABLE "payment_gateway_credentials" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"gateway" text NOT NULL,
	"mode" text NOT NULL,
	"account_label" text NOT NULL,
	"ciphertext" "bytea" NOT NULL,
	"key_version" smallint NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"last_verified_at" timestamp with time zone,
	"connected_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_gateway_credentials_gateway" CHECK ("payment_gateway_credentials"."gateway" in ('bkash', 'nagad', 'city_bank')),
	CONSTRAINT "payment_gateway_credentials_mode" CHECK ("payment_gateway_credentials"."mode" in ('live', 'sandbox')),
	CONSTRAINT "payment_gateway_credentials_status" CHECK ("payment_gateway_credentials"."status" in ('connected', 'needs_attention', 'disconnected'))
);
--> statement-breakpoint
CREATE TABLE "payment_intents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"flow" text NOT NULL,
	"purpose" text NOT NULL,
	"gateway" text NOT NULL,
	"credential_id" uuid,
	"order_id" uuid,
	"invoice_id" uuid,
	"amount_poisha" bigint NOT NULL,
	"currency" text DEFAULT 'BDT' NOT NULL,
	"merchant_reference" text NOT NULL,
	"short_code" text,
	"allowed_payment_methods" text[],
	"gateway_payment_id" text,
	"gateway_transaction_id" text,
	"status" text DEFAULT 'created' NOT NULL,
	"review_reason" text,
	"verified_amount_poisha" bigint,
	"refunded_poisha" bigint DEFAULT 0 NOT NULL,
	"reserved_refund_poisha" bigint DEFAULT 0 NOT NULL,
	"masked_card_label" text,
	"failure_reason" text,
	"is_sandbox" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"voided_at" timestamp with time zone,
	"succeeded_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	"verified_by_user_id" uuid,
	"next_check_at" timestamp with time zone,
	"check_count" smallint DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_intents_flow" CHECK ("payment_intents"."flow" in ('billing', 'shop')),
	CONSTRAINT "payment_intents_purpose" CHECK ("payment_intents"."purpose" in ('order_advance', 'order_full', 'subscription', 'whatsapp_top_up', 'sms_pack', 'ai_top_up')),
	CONSTRAINT "payment_intents_gateway" CHECK ("payment_intents"."gateway" in ('bkash', 'nagad', 'city_bank', 'manual')),
	CONSTRAINT "payment_intents_status" CHECK ("payment_intents"."status" in ('created', 'pending', 'succeeded', 'failed', 'cancelled', 'expired', 'needs_review', 'partially_refunded', 'refunded', 'disputed')),
	CONSTRAINT "payment_intents_review_reason" CHECK ("payment_intents"."review_reason" in ('amount_mismatch', 'duplicate', 'late_success', 'manual_unverified')),
	CONSTRAINT "payment_intents_currency" CHECK ("payment_intents"."currency" = 'BDT'),
	CONSTRAINT "payment_intents_amount" CHECK ("payment_intents"."amount_poisha" > 0),
	CONSTRAINT "payment_intents_refunded" CHECK ("payment_intents"."refunded_poisha" >= 0 and "payment_intents"."reserved_refund_poisha" >= 0
        and "payment_intents"."refunded_poisha" + "payment_intents"."reserved_refund_poisha" <= coalesce("payment_intents"."verified_amount_poisha", 0)),
	CONSTRAINT "payment_intents_flow_credentials" CHECK (("payment_intents"."flow" = 'billing' and "payment_intents"."credential_id" is null and "payment_intents"."gateway" <> 'manual' and "payment_intents"."order_id" is null)
       or ("payment_intents"."flow" = 'shop' and ("payment_intents"."gateway" = 'manual') = ("payment_intents"."credential_id" is null) and "payment_intents"."invoice_id" is null)),
	CONSTRAINT "payment_intents_flow_purpose" CHECK (("payment_intents"."flow" = 'shop') = ("payment_intents"."purpose" in ('order_advance', 'order_full')))
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"payment_intent_id" uuid NOT NULL,
	"amount_poisha" bigint NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"gateway_refund_id" text,
	"idempotency_key" text NOT NULL,
	"is_approved_with_two_factor" boolean DEFAULT false NOT NULL,
	"requested_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_status" CHECK ("refunds"."status" in ('requested', 'pending', 'succeeded', 'failed', 'recorded_manually')),
	CONSTRAINT "refunds_amount" CHECK ("refunds"."amount_poisha" > 0)
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"title" text NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"contact_id" uuid,
	"conversation_id" uuid,
	"order_id" uuid,
	"assignee_user_id" uuid,
	"created_by_user_id" uuid,
	"due_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_source" CHECK ("tasks"."source" in ('manual', 'automation', 'ai')),
	CONSTRAINT "tasks_status" CHECK ("tasks"."status" in ('open', 'done', 'cancelled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_zones_store_id_id_key" ON "delivery_zones" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_zones_one_default_key" ON "delivery_zones" USING btree ("store_id") WHERE "delivery_zones"."is_default";--> statement-breakpoint
CREATE UNIQUE INDEX "discount_codes_store_id_id_key" ON "discount_codes" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "discount_codes_store_id_code_key" ON "discount_codes" USING btree ("store_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_store_id_id_key" ON "orders" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_store_id_number_key" ON "orders" USING btree ("store_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_store_id_idempotency_key_key" ON "orders" USING btree ("store_id","idempotency_key") WHERE "orders"."idempotency_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_store_id_external_ref_key" ON "orders" USING btree ("store_id","external_ref") WHERE "orders"."external_ref" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "gateway_settlement_lines_transaction_key" ON "gateway_settlement_lines" USING btree ("gateway","gateway_transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_gateway_credentials_store_id_id_key" ON "payment_gateway_credentials" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_gateway_credentials_active_key" ON "payment_gateway_credentials" USING btree ("store_id","gateway","mode") WHERE "payment_gateway_credentials"."status" <> 'disconnected';--> statement-breakpoint
CREATE UNIQUE INDEX "payment_intents_store_id_id_key" ON "payment_intents" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_intents_merchant_reference_key" ON "payment_intents" USING btree ("merchant_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_intents_short_code_key" ON "payment_intents" USING btree ("short_code");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_intents_gateway_transaction_id_key" ON "payment_intents" USING btree ("gateway","gateway_transaction_id") WHERE "payment_intents"."gateway_transaction_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_store_id_idempotency_key_key" ON "refunds" USING btree ("store_id","idempotency_key");--> statement-breakpoint
ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_codes" ADD CONSTRAINT "discount_codes_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_codes" ADD CONSTRAINT "discount_codes_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_codes" ADD CONSTRAINT "discount_codes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_codes" ADD CONSTRAINT "discount_codes_contact_id_store_fk" FOREIGN KEY ("store_id","contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_store_fk" FOREIGN KEY ("store_id","order_id") REFERENCES "public"."orders"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_store_fk" FOREIGN KEY ("store_id","variant_id") REFERENCES "public"."product_variants"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_contact_id_contacts_id_fk" FOREIGN KEY ("buyer_contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_recipient_bd_area_id_bd_areas_id_fk" FOREIGN KEY ("recipient_bd_area_id") REFERENCES "public"."bd_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_zone_id_delivery_zones_id_fk" FOREIGN KEY ("delivery_zone_id") REFERENCES "public"."delivery_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_discount_code_id_discount_codes_id_fk" FOREIGN KEY ("discount_code_id") REFERENCES "public"."discount_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipped_by_user_id_users_id_fk" FOREIGN KEY ("shipped_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_possible_duplicate_of_order_id_orders_id_fk" FOREIGN KEY ("possible_duplicate_of_order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_contact_id_store_fk" FOREIGN KEY ("store_id","buyer_contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_conversation_id_store_fk" FOREIGN KEY ("store_id","conversation_id") REFERENCES "public"."conversations"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_discount_code_id_store_fk" FOREIGN KEY ("store_id","discount_code_id") REFERENCES "public"."discount_codes"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_zone_id_store_fk" FOREIGN KEY ("store_id","delivery_zone_id") REFERENCES "public"."delivery_zones"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_possible_duplicate_of_order_id_store_fk" FOREIGN KEY ("store_id","possible_duplicate_of_order_id") REFERENCES "public"."orders"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gateway_settlement_lines" ADD CONSTRAINT "gateway_settlement_lines_report_file_id_files_id_fk" FOREIGN KEY ("report_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gateway_settlement_lines" ADD CONSTRAINT "gateway_settlement_lines_payment_intent_id_payment_intents_id_fk" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gateway_settlement_lines" ADD CONSTRAINT "gateway_settlement_lines_matched_by_staff_id_staff_users_id_fk" FOREIGN KEY ("matched_by_staff_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_intent_id_payment_intents_id_fk" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_intent_id_store_fk" FOREIGN KEY ("store_id","payment_intent_id") REFERENCES "public"."payment_intents"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_gateway_credentials" ADD CONSTRAINT "payment_gateway_credentials_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_gateway_credentials" ADD CONSTRAINT "payment_gateway_credentials_connected_by_user_id_users_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_credential_id_payment_gateway_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."payment_gateway_credentials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_verified_by_user_id_users_id_fk" FOREIGN KEY ("verified_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_credential_id_store_fk" FOREIGN KEY ("store_id","credential_id") REFERENCES "public"."payment_gateway_credentials"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_order_id_store_fk" FOREIGN KEY ("store_id","order_id") REFERENCES "public"."orders"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_invoice_id_store_fk" FOREIGN KEY ("store_id","invoice_id") REFERENCES "public"."invoices"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_intent_id_payment_intents_id_fk" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_intent_id_store_fk" FOREIGN KEY ("store_id","payment_intent_id") REFERENCES "public"."payment_intents"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_contact_id_store_fk" FOREIGN KEY ("store_id","contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_conversation_id_store_fk" FOREIGN KEY ("store_id","conversation_id") REFERENCES "public"."conversations"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_order_id_store_fk" FOREIGN KEY ("store_id","order_id") REFERENCES "public"."orders"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delivery_zones_store_id_idx" ON "delivery_zones" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "delivery_zones_bd_area_ids_idx" ON "delivery_zones" USING gin ("bd_area_ids");--> statement-breakpoint
CREATE INDEX "discount_codes_store_id_source_idx" ON "discount_codes" USING btree ("store_id","source_type","source_id");--> statement-breakpoint
CREATE INDEX "discount_codes_contact_id_idx" ON "discount_codes" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "discount_codes_created_by_user_id_idx" ON "discount_codes" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "order_items_order_id_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_store_id_variant_idx" ON "order_items" USING btree ("store_id","variant_id");--> statement-breakpoint
CREATE INDEX "order_items_variant_id_idx" ON "order_items" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "orders_store_id_stage_idx" ON "orders" USING btree ("store_id","stage","created_at");--> statement-breakpoint
CREATE INDEX "orders_store_id_created_at_idx" ON "orders" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_store_id_buyer_contact_idx" ON "orders" USING btree ("store_id","buyer_contact_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_store_id_recipient_phone_idx" ON "orders" USING btree ("store_id","recipient_phone","created_at");--> statement-breakpoint
CREATE INDEX "orders_store_id_recipient_phone_outcome_idx" ON "orders" USING btree ("store_id","recipient_phone") WHERE "orders"."stage" in ('delivered', 'partially_delivered', 'returned');--> statement-breakpoint
CREATE INDEX "orders_store_id_attribution_idx" ON "orders" USING btree ("store_id","attributed_source_type","attributed_source_id") WHERE "orders"."attributed_source_type" is not null;--> statement-breakpoint
CREATE INDEX "orders_store_id_follow_up_idx" ON "orders" USING btree ("store_id","follow_up_on") WHERE "orders"."stage" = 'on_hold';--> statement-breakpoint
CREATE INDEX "orders_buyer_contact_id_idx" ON "orders" USING btree ("buyer_contact_id");--> statement-breakpoint
CREATE INDEX "orders_conversation_id_idx" ON "orders" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "orders_discount_code_id_idx" ON "orders" USING btree ("discount_code_id");--> statement-breakpoint
CREATE INDEX "orders_created_by_user_id_idx" ON "orders" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "orders_shipped_by_user_id_idx" ON "orders" USING btree ("shipped_by_user_id");--> statement-breakpoint
CREATE INDEX "orders_recipient_bd_area_id_idx" ON "orders" USING btree ("recipient_bd_area_id");--> statement-breakpoint
CREATE INDEX "orders_delivery_zone_id_idx" ON "orders" USING btree ("delivery_zone_id");--> statement-breakpoint
CREATE INDEX "orders_possible_duplicate_idx" ON "orders" USING btree ("possible_duplicate_of_order_id");--> statement-breakpoint
CREATE INDEX "gateway_settlement_lines_queue_idx" ON "gateway_settlement_lines" USING btree ("settlement_date") WHERE "gateway_settlement_lines"."status" in ('unmatched', 'escalated');--> statement-breakpoint
CREATE INDEX "gateway_settlement_lines_payment_intent_id_idx" ON "gateway_settlement_lines" USING btree ("payment_intent_id");--> statement-breakpoint
CREATE INDEX "gateway_settlement_lines_report_file_id_idx" ON "gateway_settlement_lines" USING btree ("report_file_id");--> statement-breakpoint
CREATE INDEX "gateway_settlement_lines_matched_by_staff_id_idx" ON "gateway_settlement_lines" USING btree ("matched_by_staff_id");--> statement-breakpoint
CREATE INDEX "payment_events_intent_idx" ON "payment_events" USING btree ("store_id","payment_intent_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_events_payment_intent_id_idx" ON "payment_events" USING btree ("payment_intent_id");--> statement-breakpoint
CREATE INDEX "payment_gateway_credentials_store_id_idx" ON "payment_gateway_credentials" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "payment_gateway_credentials_connected_by_user_id_idx" ON "payment_gateway_credentials" USING btree ("connected_by_user_id");--> statement-breakpoint
CREATE INDEX "payment_intents_store_id_order_id_idx" ON "payment_intents" USING btree ("store_id","order_id");--> statement-breakpoint
CREATE INDEX "payment_intents_store_id_created_at_idx" ON "payment_intents" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_intents_store_id_status_idx" ON "payment_intents" USING btree ("store_id","status");--> statement-breakpoint
CREATE INDEX "payment_intents_check_due_idx" ON "payment_intents" USING btree ("next_check_at") WHERE "payment_intents"."next_check_at" is not null;--> statement-breakpoint
CREATE INDEX "payment_intents_order_id_idx" ON "payment_intents" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payment_intents_invoice_id_idx" ON "payment_intents" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "payment_intents_credential_id_idx" ON "payment_intents" USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX "payment_intents_verified_by_user_id_idx" ON "payment_intents" USING btree ("verified_by_user_id");--> statement-breakpoint
CREATE INDEX "payment_intents_created_by_user_id_idx" ON "payment_intents" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "refunds_payment_intent_id_idx" ON "refunds" USING btree ("payment_intent_id");--> statement-breakpoint
CREATE INDEX "refunds_requested_by_user_id_idx" ON "refunds" USING btree ("requested_by_user_id");--> statement-breakpoint
CREATE INDEX "tasks_store_id_status_due_idx" ON "tasks" USING btree ("store_id","status","due_at");--> statement-breakpoint
CREATE INDEX "tasks_store_id_assignee_idx" ON "tasks" USING btree ("store_id","assignee_user_id","status");--> statement-breakpoint
CREATE INDEX "tasks_contact_id_idx" ON "tasks" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "tasks_conversation_id_idx" ON "tasks" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "tasks_order_id_idx" ON "tasks" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "tasks_assignee_user_id_idx" ON "tasks" USING btree ("assignee_user_id");--> statement-breakpoint
CREATE INDEX "tasks_created_by_user_id_idx" ON "tasks" USING btree ("created_by_user_id");--> statement-breakpoint

-- Written by hand below this line (docs/rules/database.md, Migrations step 2). Row level
-- security: a connection sees and writes only the rows of the store set by
-- TenantDatabase.forStore. See docs/data/isolation-and-access.md.
ALTER TABLE "discount_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "discount_codes_isolation" ON "discount_codes"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "delivery_zones" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "delivery_zones_isolation" ON "delivery_zones"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "order_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "order_items_isolation" ON "order_items"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "orders_isolation" ON "orders"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "payment_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "payment_events_isolation" ON "payment_events"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "payment_gateway_credentials" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "payment_gateway_credentials_isolation" ON "payment_gateway_credentials"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "payment_intents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "payment_intents_isolation" ON "payment_intents"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "refunds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "refunds_isolation" ON "refunds"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tasks_isolation" ON "tasks"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint

-- Gateway events are evidence of what happened.
REVOKE UPDATE, DELETE ON "payment_events" FROM dakly_app;--> statement-breakpoint
-- Money records are cancelled or voided, never removed.
REVOKE DELETE ON "orders", "payment_intents", "refunds" FROM dakly_app;--> statement-breakpoint
CREATE FUNCTION payment_intent_for_reference(p_reference text) RETURNS TABLE(store_id uuid, payment_intent_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT store_id, id FROM payment_intents
  WHERE merchant_reference = p_reference OR short_code = p_reference
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION payment_intent_for_reference(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION payment_intent_for_reference(text) TO dakly_app;--> statement-breakpoint
CREATE FUNCTION due_payment_checks(p_limit integer) RETURNS TABLE(store_id uuid, payment_intent_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT store_id, id FROM payment_intents WHERE next_check_at <= now() ORDER BY next_check_at LIMIT p_limit
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION due_payment_checks(integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION due_payment_checks(integer) TO dakly_app;--> statement-breakpoint
ALTER TABLE "orders" ALTER CONSTRAINT "orders_buyer_contact_id_store_fk" DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "orders" ALTER CONSTRAINT "orders_conversation_id_store_fk" DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint

-- Settlement lines are Dakly's own money, read by the admin app; a line is never deleted.
REVOKE DELETE ON "gateway_settlement_lines" FROM dakly_app;--> statement-breakpoint
