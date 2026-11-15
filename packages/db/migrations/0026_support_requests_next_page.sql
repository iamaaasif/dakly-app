-- One row past the 50-row page tells the caller whether another page exists.
CREATE OR REPLACE FUNCTION support_request_metadata(staff_id uuid, before_id uuid)
RETURNS TABLE (
  id uuid, "staffName" text, "isBreakGlass" boolean, scopes text[], access text,
  status text, reason text, "durationMinutes" integer, "requestedAt" text, "expiresAt" text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT g.id, u.name, g.is_break_glass, g.scopes, g.access,
    CASE WHEN (g.status='requested' AND g.requested_at<=clock_timestamp()-INTERVAL '30 minutes')
      OR (g.status='approved' AND g.expires_at<=clock_timestamp())
      THEN 'expired' ELSE g.status END,
    g.reason, g.duration_minutes,
    to_char(g.requested_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    to_char(g.expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  FROM public.support_grants g
  JOIN public.staff_users u ON u.id=g.staff_user_id
  WHERE g.staff_user_id=staff_id AND (before_id IS NULL OR g.id<before_id)
  ORDER BY g.id DESC
  LIMIT 51
$$;
