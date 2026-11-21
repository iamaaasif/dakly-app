CREATE FUNCTION due_conversation_memory_updates(p_as_of timestamptz, p_limit integer) RETURNS TABLE(store_id uuid, conversation_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT c.store_id, c.id
  FROM public.conversations c
  JOIN public.stores s ON s.id = c.store_id
  JOIN public.contacts k ON k.store_id = c.store_id AND k.id = c.contact_id
  WHERE c.last_message_at IS NOT NULL
    AND (c.last_message_at <= p_as_of - interval '2 hours' OR c.status = 'done')
    AND (c.memory_built_through_message_at IS NULL OR c.last_message_at > c.memory_built_through_message_at)
    AND k.deleted_at IS NULL
    AND 'chats' = ANY(s.extensions)
  ORDER BY c.last_message_at, c.id
  LIMIT p_limit
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION due_conversation_memory_updates(timestamptz, integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION due_conversation_memory_updates(timestamptz, integer) TO dakly_app;
