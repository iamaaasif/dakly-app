-- Only IDs cross RLS. The sweep re-queues the approval job; the job reads the campaign in its store.
CREATE FUNCTION campaign_stalled_approvals(stalled_before timestamptz, row_limit integer)
  RETURNS TABLE(store_id uuid, id uuid, approved_at timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT c.store_id, c.id, c.approved_at
  FROM public.campaigns c
  WHERE c.status = 'approving' AND c.approval_progress_at < stalled_before
  ORDER BY c.approval_progress_at, c.id
  LIMIT greatest(0, least(coalesce(row_limit, 0), 100))
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION campaign_stalled_approvals(timestamptz, integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION campaign_stalled_approvals(timestamptz, integer) TO dakly_app;
