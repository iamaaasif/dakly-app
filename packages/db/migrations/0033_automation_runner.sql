ALTER TABLE "automation_run_steps" DROP CONSTRAINT "automation_run_steps_kind";--> statement-breakpoint
ALTER TABLE "automation_run_steps" ADD CONSTRAINT "automation_run_steps_kind" CHECK ("automation_run_steps"."kind" in ('trigger', 'wait', 'condition', 'random_split', 'send', 'action', 'goal', 'exit'));--> statement-breakpoint
-- The sweep queues one job per (run, step), so the claim returns the step. A paused workflow
-- holds its runs where they are; they are due again once it is enabled. The step job counts
-- attempts when it starts work, so a lease that expired in a slow queue does not count.
DROP FUNCTION due_automation_runs(integer);--> statement-breakpoint
CREATE FUNCTION due_automation_runs(p_limit integer) RETURNS TABLE(store_id uuid, automation_run_id uuid, step_key text, claimed_at timestamptz)
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH due AS (
    SELECT d.id FROM automation_runs d
    WHERE ((d.status = 'waiting' AND d.wake_at <= now())
       OR (d.status = 'running' AND (d.claimed_at IS NULL OR d.claimed_at <= now() - interval '5 minutes')))
      AND NOT EXISTS (SELECT 1 FROM automations a WHERE a.id = d.automation_id AND a.status = 'paused')
    ORDER BY coalesce(d.claimed_at, d.wake_at, d.entered_at), d.id
    LIMIT greatest(0, least(coalesce(p_limit, 100), 1000)) FOR UPDATE OF d SKIP LOCKED
  )
  UPDATE automation_runs r SET status = 'running', claimed_at = date_trunc('milliseconds', clock_timestamp()),
    updated_at = now()
  FROM due WHERE r.id = due.id RETURNING r.store_id, r.id, r.current_step_key, r.claimed_at
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION due_automation_runs(integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION due_automation_runs(integer) TO dakly_app;
