ALTER TABLE "campaign_recipients" ADD COLUMN "redirect_link_codes" text[];--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "wrapped_sms_approved_at" timestamp with time zone;
--> statement-breakpoint
-- Written by hand below this line
-- Older API replicas clear approved_at without clearing the wrapping marker.
CREATE FUNCTION public.clear_campaign_sms_wrapped_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.wrapped_sms_approved_at := NULL;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER campaigns_clear_sms_wrapped_approval
BEFORE UPDATE OF approved_at ON public.campaigns
FOR EACH ROW
WHEN (NEW.approved_at IS NULL AND NEW.wrapped_sms_approved_at IS NOT NULL)
EXECUTE FUNCTION public.clear_campaign_sms_wrapped_approval();
