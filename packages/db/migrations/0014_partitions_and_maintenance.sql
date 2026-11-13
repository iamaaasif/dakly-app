-- Monthly partitions for the three append-only tables that grow fastest (docs/data/growth.md,
-- D31). Drizzle creates them as plain tables; this rebuilds each one, still empty, as a table
-- partitioned by its time column and puts back every key, foreign key and index by name.
CREATE FUNCTION pg_temp.partition_by_month(p_table text, p_column text) RETURNS void
  LANGUAGE plpgsql
AS $$
DECLARE
  definitions text[];
  definition text;
BEGIN
  SELECT array_agg(statement ORDER BY position) INTO definitions FROM (
    SELECT CASE c.contype WHEN 'p' THEN 1 ELSE 2 END AS position,
      format('ALTER TABLE public.%I ADD CONSTRAINT %I %s', p_table, c.conname, pg_get_constraintdef(c.oid)) AS statement
    FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = ('public.' || p_table)::regclass AND c.contype IN ('p', 'u', 'f')
    UNION ALL
    SELECT 3, pg_get_indexdef(i.indexrelid)
    FROM pg_catalog.pg_index i
    WHERE i.indrelid = ('public.' || p_table)::regclass
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c WHERE c.conindid = i.indexrelid)
  ) parts;
  EXECUTE format('ALTER TABLE public.%I RENAME TO %I', p_table, p_table || '_plain');
  EXECUTE format('CREATE TABLE public.%I (LIKE public.%I INCLUDING DEFAULTS INCLUDING CONSTRAINTS) PARTITION BY RANGE (%I)',
    p_table, p_table || '_plain', p_column);
  EXECUTE format('DROP TABLE public.%I', p_table || '_plain');
  FOREACH definition IN ARRAY definitions LOOP
    EXECUTE definition;
  END LOOP;
END
$$;--> statement-breakpoint
SELECT pg_temp.partition_by_month('audit_log', 'created_at');--> statement-breakpoint
SELECT pg_temp.partition_by_month('ai_runs', 'created_at');--> statement-breakpoint
SELECT pg_temp.partition_by_month('tracked_link_visits', 'occurred_at');--> statement-breakpoint
DROP FUNCTION pg_temp.partition_by_month(text, text);--> statement-breakpoint

-- The rebuilt parents get the same store policy as every shop table. Queries go through the
-- parent, so the policy applies to every partition.
ALTER TABLE "ai_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "ai_runs_isolation" ON "ai_runs"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "audit_log_isolation" ON "audit_log"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "tracked_link_visits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tracked_link_visits_isolation" ON "tracked_link_visits"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
-- Audit history and link taps are append-only for the app.
REVOKE UPDATE, DELETE ON "audit_log", "tracked_link_visits" FROM dakly_app;--> statement-breakpoint


-- Creates this month's partition and the next p_months_ahead, named like audit_log_y2026m11.
-- The app reaches rows only through the parent, so each partition gets RLS and no grants.
CREATE FUNCTION ensure_monthly_partitions(p_months_ahead integer) RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  parent text;
  month_start timestamp;
  partition_name text;
  created integer := 0;
BEGIN
  FOREACH parent IN ARRAY ARRAY['audit_log', 'ai_runs', 'tracked_link_visits'] LOOP
    FOR step IN 0..greatest(0, least(coalesce(p_months_ahead, 3), 12)) LOOP
      month_start := date_trunc('month', now() AT TIME ZONE 'UTC') + make_interval(months => step);
      partition_name := parent || to_char(month_start, '"_y"YYYY"m"MM');
      CONTINUE WHEN to_regclass('public.' || partition_name) IS NOT NULL;
      EXECUTE format('CREATE TABLE public.%I PARTITION OF public.%I FOR VALUES FROM (%L) TO (%L)',
        partition_name, parent, month_start AT TIME ZONE 'UTC',
        (month_start + interval '1 month') AT TIME ZONE 'UTC');
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', partition_name);
      EXECUTE format('REVOKE ALL ON public.%I FROM dakly_app', partition_name);
      created := created + 1;
    END LOOP;
  END LOOP;
  RETURN created;
END
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION ensure_monthly_partitions(integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION ensure_monthly_partitions(integer) TO dakly_app;--> statement-breakpoint
SELECT ensure_monthly_partitions(3);--> statement-breakpoint

-- Drops whole months past retention: AI runs and link visits after 13 months, which covers the
-- 372-day attribution rebuild with exact tap times (ADR 0008). A month is dropped only when the
-- rollup watermark has passed its last Asia/Dhaka day, so a missed or failed night keeps the raw
-- rows until the job catches up. Audit log months are never dropped here: the archive job exports
-- them to R2 first and drops them as the owner, so the app role can never shorten audit history.
CREATE FUNCTION drop_expired_partitions() RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  expired record;
  dropped integer := 0;
BEGIN
  FOR expired IN
    SELECT child.relname FROM pg_catalog.pg_inherits h
    JOIN pg_catalog.pg_class parent ON parent.oid = h.inhparent
    JOIN pg_catalog.pg_class child ON child.oid = h.inhrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = parent.relnamespace AND n.nspname = 'public'
    JOIN maintenance_watermarks w ON w.rollup = CASE parent.relname
      WHEN 'ai_runs' THEN 'ai_run_daily_metrics' WHEN 'tracked_link_visits' THEN 'tracked_link_visit_days' END
    WHERE child.relname ~ '_y[0-9]{4}m[0-9]{2}$'
      AND to_date(right(child.relname, 7), 'YYYY"m"MM') + interval '1 month' <= now() AT TIME ZONE 'UTC' - interval '13 months'
      -- The month's last instant falls on this Dhaka date (UTC+6), so the rollup must cover it.
      AND w.completed_through >= (to_date(right(child.relname, 7), 'YYYY"m"MM') + interval '1 month')::date
  LOOP
    EXECUTE format('DROP TABLE public.%I', expired.relname);
    dropped := dropped + 1;
  END LOOP;
  RETURN dropped;
END
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION drop_expired_partitions() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION drop_expired_partitions() TO dakly_app;--> statement-breakpoint
