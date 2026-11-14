CREATE FUNCTION public.invalidate_disabled_staff_authentication() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  UPDATE public.staff_sessions SET revoked_at = CURRENT_TIMESTAMP
  WHERE staff_user_id = NEW.id AND revoked_at IS NULL;
  UPDATE public.staff_challenges SET consumed_at = CURRENT_TIMESTAMP
  WHERE staff_user_id = NEW.id AND consumed_at IS NULL;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.invalidate_disabled_staff_authentication() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.invalidate_disabled_staff_authentication() TO dakly_app;
--> statement-breakpoint
CREATE TRIGGER invalidate_disabled_staff_authentication
AFTER UPDATE OF status ON public.staff_users
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'disabled')
EXECUTE FUNCTION public.invalidate_disabled_staff_authentication();
--> statement-breakpoint
UPDATE public.staff_sessions AS sessions SET revoked_at = CURRENT_TIMESTAMP
FROM public.staff_users AS staff
WHERE sessions.staff_user_id = staff.id AND staff.status = 'disabled' AND sessions.revoked_at IS NULL;
--> statement-breakpoint
UPDATE public.staff_challenges AS challenges SET consumed_at = CURRENT_TIMESTAMP
FROM public.staff_users AS staff
WHERE challenges.staff_user_id = staff.id AND staff.status = 'disabled' AND challenges.consumed_at IS NULL;
