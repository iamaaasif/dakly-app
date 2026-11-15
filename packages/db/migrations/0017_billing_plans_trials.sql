ALTER TABLE plans ADD COLUMN trial_days smallint DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE coupons ADD COLUMN duration text DEFAULT 'once' NOT NULL;
--> statement-breakpoint
ALTER TABLE coupons ADD COLUMN duration_months smallint;
--> statement-breakpoint
ALTER TABLE subscriptions ADD COLUMN coupon_id uuid;
--> statement-breakpoint
ALTER TABLE subscriptions ADD COLUMN coupon_ends_at timestamp with time zone;
--> statement-breakpoint
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_coupon_id_coupons_id_fk FOREIGN KEY (coupon_id) REFERENCES public.coupons (id);
--> statement-breakpoint
CREATE INDEX subscriptions_coupon_id_idx
  ON subscriptions (coupon_id);
--> statement-breakpoint
ALTER TABLE plans ADD CONSTRAINT plans_trial_days CHECK (plans.trial_days BETWEEN 0 AND 90);
--> statement-breakpoint
ALTER TABLE coupons ADD CONSTRAINT coupons_duration CHECK (coupons.duration IN ('once', 'months', 'forever'));
--> statement-breakpoint
ALTER TABLE coupons ADD CONSTRAINT coupons_duration_months CHECK ((coupons.duration = 'months'
                                                               AND coupons.duration_months IS NOT NULL
                                                               AND coupons.duration_months BETWEEN 1 AND 36)
                                                               OR (coupons.duration IN ('once', 'forever')
                                                               AND coupons.duration_months IS NULL));
--> statement-breakpoint
ALTER TABLE coupons ADD CONSTRAINT coupons_redemption_count CHECK (coupons.redemption_count >= 0);
--> statement-breakpoint
-- Written by hand below this line
-- Redemption is cumulative so an edit cannot unlock a coupon already used on an invoice.
CREATE FUNCTION public.protect_redeemed_coupon()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
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
CREATE TRIGGER coupons_protect_redemption
BEFORE UPDATE ON public.coupons
FOR EACH ROW
EXECUTE FUNCTION public.protect_redeemed_coupon();
