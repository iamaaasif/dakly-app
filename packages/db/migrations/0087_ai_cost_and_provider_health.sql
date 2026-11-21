CREATE TABLE "ai_cost_alerts" (
	"store_id" uuid NOT NULL,
	"day" date NOT NULL,
	"cost_micro_usd" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_cost_alerts_store_id_day_pk" PRIMARY KEY("store_id","day")
);
--> statement-breakpoint
ALTER TABLE "ai_cost_alerts" ADD CONSTRAINT "ai_cost_alerts_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
GRANT SELECT, INSERT ON "ai_cost_alerts" TO dakly_app;--> statement-breakpoint
-- Staff report functions (ADR 0005): counts and cost per shop, never message text or customers.
CREATE FUNCTION admin_ai_cost_by_store(p_from timestamptz, p_to timestamptz, p_min_cost_micro_usd bigint, p_limit integer) RETURNS TABLE(store_id uuid, name text, runs integer, failed_runs integer, cost_micro_usd bigint)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT s.id, s.name, count(*)::integer,
    (count(*) FILTER (WHERE r.outcome IN ('failed', 'timeout')))::integer,
    coalesce(sum(r.cost_micro_usd), 0)::bigint
  FROM ai_runs r
  JOIN stores s ON s.id = r.store_id
  WHERE r.created_at >= p_from AND r.created_at < p_to
  GROUP BY s.id, s.name
  HAVING coalesce(sum(r.cost_micro_usd), 0) >= p_min_cost_micro_usd
  ORDER BY 5 DESC, s.id
  LIMIT p_limit
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION admin_ai_cost_by_store(timestamptz, timestamptz, bigint, integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION admin_ai_cost_by_store(timestamptz, timestamptz, bigint, integer) TO dakly_app;--> statement-breakpoint
-- Recent outcomes per vendor path. Rows that never left the queue do not count as attempts.
CREATE FUNCTION admin_provider_health(p_now timestamptz) RETURNS TABLE(provider text, span text, attempts integer, failures integer, average_latency_ms integer)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH spans(name, length) AS (VALUES ('hour', interval '1 hour'), ('day', interval '1 day'))
  SELECT 'ai:' || r.model, w.name, count(*)::integer,
    (count(*) FILTER (WHERE r.outcome IN ('failed', 'timeout')))::integer,
    avg(r.latency_ms)::integer
  FROM ai_runs r CROSS JOIN spans w
  WHERE r.created_at >= p_now - w.length AND r.created_at < p_now
  GROUP BY r.model, w.name
  UNION ALL
  SELECT 'sms', w.name, count(*)::integer,
    (count(*) FILTER (WHERE m.status = 'failed'))::integer, NULL::integer
  FROM sms_messages m CROSS JOIN spans w
  WHERE m.status IN ('sent', 'delivered', 'failed')
    AND m.created_at >= p_now - w.length AND m.created_at < p_now
  GROUP BY w.name
  UNION ALL
  SELECT 'channel:' || c.channel, w.name, count(*)::integer,
    (count(*) FILTER (WHERE m.status = 'failed'))::integer, NULL::integer
  FROM messages m
  JOIN conversations c ON c.store_id = m.store_id AND c.id = m.conversation_id
  CROSS JOIN spans w
  WHERE m.direction = 'out' AND m.status IN ('sent', 'delivered', 'read', 'failed')
    AND m.created_at >= p_now - w.length AND m.created_at < p_now
  GROUP BY c.channel, w.name
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION admin_provider_health(timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION admin_provider_health(timestamptz) TO dakly_app;
