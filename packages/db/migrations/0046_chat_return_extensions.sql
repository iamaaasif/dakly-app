DROP FUNCTION due_conversation_returns(integer);--> statement-breakpoint
CREATE FUNCTION due_conversation_returns(p_as_of timestamptz, p_limit integer) RETURNS TABLE(store_id uuid, conversation_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT c.store_id, c.id
  FROM public.conversations c
  JOIN public.stores s ON s.id = c.store_id
  WHERE c.ai_resumes_at <= p_as_of AND 'chats' = ANY(s.extensions)
  ORDER BY c.ai_resumes_at, c.id
  LIMIT p_limit
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION due_conversation_returns(timestamptz, integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION due_conversation_returns(timestamptz, integer) TO dakly_app;
