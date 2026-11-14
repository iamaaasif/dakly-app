ALTER TABLE "coupons" ADD COLUMN "duration" text DEFAULT 'once' NOT NULL;--> statement-breakpoint
ALTER TABLE "coupons" ADD COLUMN "duration_months" smallint;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "trial_days" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "coupon_id" uuid;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "coupon_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscriptions_coupon_id_idx" ON "subscriptions" USING btree ("coupon_id");--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_duration" CHECK ("coupons"."duration" in ('once', 'months', 'forever'));--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_duration_months" CHECK (("coupons"."duration" = 'months' and "coupons"."duration_months" is not null and "coupons"."duration_months" between 1 and 36) or ("coupons"."duration" in ('once', 'forever') and "coupons"."duration_months" is null));--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_redemption_count" CHECK ("coupons"."redemption_count" >= 0);--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_trial_days" CHECK ("plans"."trial_days" between 0 and 90);--> statement-breakpoint
-- Redemption is cumulative so an edit cannot unlock a coupon already used on an invoice.
CREATE FUNCTION public.protect_redeemed_coupon() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.redemption_count < OLD.redemption_count OR
    (OLD.redemption_count > 0 AND ROW(NEW.kind, NEW.discount_percent,
      NEW.discount_amount_poisha, NEW.duration, NEW.duration_months)
      IS DISTINCT FROM ROW(OLD.kind, OLD.discount_percent,
      OLD.discount_amount_poisha, OLD.duration, OLD.duration_months)) THEN
    RAISE EXCEPTION 'Redeemed coupon terms cannot change; create a new coupon'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER coupons_protect_redemption BEFORE UPDATE ON public.coupons
FOR EACH ROW EXECUTE FUNCTION public.protect_redeemed_coupon();
