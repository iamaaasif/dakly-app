-- The archive job exports an audit month to R2, then asks for it to be dropped. The age and row
-- count checks live here, so no caller can drop a recent month or one whose export was short.
-- Definer function like drop_expired_partitions(): the app role still has no DROP right.
CREATE FUNCTION public.drop_audit_month(p_month date, p_expected_rows bigint)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  partition_name text;
  actual_rows bigint;
BEGIN
  IF p_month IS NULL OR p_month <> date_trunc('month', p_month)::date THEN
    RAISE EXCEPTION 'p_month must be the first day of a month' USING ERRCODE = '22023';
  END IF;
  IF p_month + interval '1 month' > now() AT TIME ZONE 'UTC' - interval '24 months' THEN
    RAISE EXCEPTION 'audit month is newer than 24 months' USING ERRCODE = '22023';
  END IF;
  partition_name := 'audit_log' || to_char(p_month, '"_y"YYYY"m"MM');
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_inherits h
    JOIN pg_catalog.pg_class parent ON parent.oid = h.inhparent AND parent.relname = 'audit_log'
    JOIN pg_catalog.pg_class child ON child.oid = h.inhrelid AND child.relname = partition_name
    JOIN pg_catalog.pg_namespace n ON n.oid = child.relnamespace AND n.nspname = 'public'
  ) THEN
    RAISE EXCEPTION 'no audit_log partition for that month' USING ERRCODE = '22023';
  END IF;
  EXECUTE format('SELECT count(*) FROM public.%I', partition_name) INTO actual_rows;
  IF actual_rows <> p_expected_rows THEN
    RAISE EXCEPTION 'audit month holds % rows, expected %', actual_rows, p_expected_rows
      USING ERRCODE = '23514';
  END IF;
  EXECUTE format('DROP TABLE public.%I', partition_name);
END
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.drop_audit_month(date, bigint) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.drop_audit_month(date, bigint) TO dakly_app;
