CREATE FUNCTION admin_mask_phone(p_phone text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE WHEN p_phone IS NULL THEN NULL
    ELSE left(p_phone, 4) || repeat('*', greatest(char_length(p_phone) - 6, 0)) || right(p_phone, 2) END
$$;--> statement-breakpoint
CREATE FUNCTION admin_shop_list(p_search text, p_status text, p_plan_code text, p_cursor_created_at timestamptz, p_cursor_id uuid, p_limit integer)
  RETURNS TABLE(store_id uuid, name text, slug text, owner_name text, owner_phone_masked text, plan_code text, plan_name text, status text, mrr_poisha bigint, created_at timestamptz, last_active_at timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  -- Shop metadata only: phones are masked here and no message, customer or secret column is read.
  WITH shops AS (
    SELECT s.id, s.name, s.slug, s.created_at, p.code AS plan_code, p.name AS plan_name,
      CASE WHEN s.status <> 'active' THEN s.status ELSE coalesce(sub.status, 'active') END AS status,
      CASE WHEN sub.status IN ('active', 'past_due') THEN
        CASE WHEN sub.billing_cycle = 'yearly' THEN sub.current_period_price_poisha / 12 ELSE sub.current_period_price_poisha END
        ELSE 0 END AS mrr_poisha,
      o.name AS owner_name, o.phone AS owner_phone,
      (SELECT max(m.last_active_at) FROM memberships m WHERE m.store_id = s.id) AS last_active_at
    FROM stores s
    LEFT JOIN subscriptions sub ON sub.store_id = s.id
    LEFT JOIN plans p ON p.id = sub.plan_id
    LEFT JOIN LATERAL (
      SELECT u.name, u.phone FROM memberships m JOIN users u ON u.id = m.user_id
      WHERE m.store_id = s.id AND m.built_in_role = 'owner' AND m.status = 'active'
      ORDER BY m.joined_at NULLS LAST LIMIT 1
    ) o ON true
  )
  SELECT sh.id, sh.name, sh.slug, sh.owner_name, admin_mask_phone(sh.owner_phone), sh.plan_code, sh.plan_name, sh.status, sh.mrr_poisha::bigint, sh.created_at, sh.last_active_at
  FROM shops sh
  WHERE (p_status IS NULL OR sh.status = p_status)
    AND (p_plan_code IS NULL OR sh.plan_code = p_plan_code)
    AND (p_cursor_id IS NULL OR (sh.created_at, sh.id) < (p_cursor_created_at, p_cursor_id))
    AND (p_search IS NULL
      OR sh.name ILIKE '%' || replace(replace(replace(p_search, '\', '\\'), '%', '\%'), '_', '\_') || '%'
      OR sh.slug = lower(p_search)
      OR sh.id::text = lower(p_search)
      OR sh.owner_phone = p_search
      OR EXISTS (SELECT 1 FROM channel_connections c WHERE c.store_id = sh.id AND c.external_account_id = p_search))
  ORDER BY sh.created_at DESC, sh.id DESC
  LIMIT p_limit
$$;--> statement-breakpoint
CREATE FUNCTION admin_shop_detail(p_store_id uuid) RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  -- Metadata only: no message, customer, token or secret column is read.
  SELECT jsonb_build_object(
    'storeId', s.id,
    'name', s.name,
    'slug', s.slug,
    'status', CASE WHEN s.status <> 'active' THEN s.status ELSE coalesce(sub.status, 'active') END,
    'suspendedReason', s.suspended_reason,
    'extensions', to_jsonb(s.extensions),
    'createdAt', s.created_at,
    'subscription', CASE WHEN sub.id IS NULL THEN NULL ELSE jsonb_build_object(
      'planCode', p.code,
      'planName', p.name,
      'billingCycle', sub.billing_cycle,
      'status', sub.status,
      'pricePoisha', sub.current_period_price_poisha,
      'trialEndsAt', sub.trial_ends_at,
      'currentPeriodEnd', sub.current_period_end,
      'isCancellationScheduled', sub.is_cancellation_scheduled,
      'pastDueSince', sub.past_due_since) END,
    'team', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'name', u.name, 'role', m.built_in_role, 'phoneMasked', admin_mask_phone(u.phone), 'lastActiveAt', m.last_active_at)
        ORDER BY (m.built_in_role = 'owner') DESC, m.joined_at NULLS LAST)
      FROM memberships m JOIN users u ON u.id = m.user_id
      WHERE m.store_id = s.id AND m.status = 'active'), '[]'::jsonb),
    'channels', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'kind', c.kind, 'displayName', c.display_name, 'status', c.status, 'isAiLive', c.is_ai_live,
          'whatsappQualityRating', c.whatsapp_quality_rating, 'connectedAt', c.connected_at)
        ORDER BY c.connected_at)
      FROM channel_connections c WHERE c.store_id = s.id AND c.status <> 'disconnected'), '[]'::jsonb))
  FROM stores s
  LEFT JOIN subscriptions sub ON sub.store_id = s.id
  LEFT JOIN plans p ON p.id = sub.plan_id
  WHERE s.id = p_store_id
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION admin_mask_phone(text) FROM PUBLIC;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION admin_shop_list(text, text, text, timestamptz, uuid, integer) FROM PUBLIC;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION admin_shop_detail(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION admin_mask_phone(text) TO dakly_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION admin_shop_list(text, text, text, timestamptz, uuid, integer) TO dakly_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION admin_shop_detail(uuid) TO dakly_app;
