-- Conversations with customer messages the memory job has not read yet, quiet for two hours or done.
CREATE FUNCTION due_conversation_memories(p_as_of timestamptz, p_limit integer) RETURNS TABLE(store_id uuid, conversation_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT c.store_id, c.id
  FROM public.conversations c
  JOIN public.stores s ON s.id = c.store_id
  JOIN public.contacts k ON k.store_id = c.store_id AND k.id = c.contact_id
  WHERE 'chats' = ANY(s.extensions)
    AND k.deleted_at IS NULL
    AND (c.status = 'done' OR c.last_message_at <= p_as_of - interval '2 hours')
    AND EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.conversation_id = c.id AND m.store_id = c.store_id
        AND m.direction = 'in' AND m.author_type = 'customer' AND m.kind <> 'note'
        AND (c.memory_built_through_message_at IS NULL
          OR (m.created_at, m.id) > (c.memory_built_through_message_at, c.memory_built_through_message_id))
    )
  ORDER BY c.last_message_at, c.id
  LIMIT p_limit
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION due_conversation_memories(timestamptz, integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION due_conversation_memories(timestamptz, integer) TO dakly_app;
