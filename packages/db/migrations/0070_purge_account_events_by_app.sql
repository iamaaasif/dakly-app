-- The daily maintenance job runs as dakly_app, so the purge becomes a definer function like
-- drop_expired_partitions(). It already rejects batch sizes outside 1-1,000 and deletes only rows
-- older than two years, so the app role cannot use it to remove newer history.
ALTER FUNCTION public.purge_account_security_events(integer) SECURITY DEFINER;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.purge_account_security_events(integer) TO dakly_app;
