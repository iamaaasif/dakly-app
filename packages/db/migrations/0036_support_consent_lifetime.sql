ALTER TABLE "support_grants" DROP CONSTRAINT "support_grants_staff_session_id_staff_sessions_id_fk";
--> statement-breakpoint
DROP INDEX "support_grants_staff_session_id_idx";--> statement-breakpoint
ALTER TABLE "support_grants" DROP COLUMN "staff_session_id";
--> statement-breakpoint
-- Lifecycle services still audit the disabling actor; this invariant also covers other writers.
CREATE FUNCTION public.end_disabled_staff_support() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  UPDATE public.support_grants SET status = 'ended', ended_at = clock_timestamp()
  WHERE staff_user_id = NEW.id AND status IN ('requested', 'approved');
  RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.end_disabled_staff_support() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.end_disabled_staff_support() TO dakly_app;
--> statement-breakpoint
CREATE TRIGGER end_disabled_staff_support
AFTER UPDATE OF status ON public.staff_users
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'disabled')
EXECUTE FUNCTION public.end_disabled_staff_support();
--> statement-breakpoint
UPDATE public.support_grants AS grants SET status = 'ended', ended_at = clock_timestamp()
FROM public.staff_users AS staff
WHERE grants.staff_user_id = staff.id AND staff.status = 'disabled'
  AND grants.status IN ('requested', 'approved');
