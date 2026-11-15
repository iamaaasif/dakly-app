CREATE TABLE ownership_transfers (
  id uuid PRIMARY KEY NOT NULL,
  store_id uuid NOT NULL,
  owner_user_id uuid NOT NULL,
  new_owner_user_id uuid NOT NULL,
  status text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT ownership_transfers_status CHECK (ownership_transfers.status IN ('pending', 'accepted', 'cancelled', 'expired')),
  CONSTRAINT ownership_transfers_distinct_users CHECK (ownership_transfers.owner_user_id <> ownership_transfers.new_owner_user_id)
);
--> statement-breakpoint
ALTER TABLE ownership_transfers ADD CONSTRAINT ownership_transfers_store_id_stores_id_fk FOREIGN KEY (store_id) REFERENCES public.stores (id);
--> statement-breakpoint
ALTER TABLE ownership_transfers ADD CONSTRAINT ownership_transfers_owner_user_id_users_id_fk FOREIGN KEY (owner_user_id) REFERENCES public.users (id);
--> statement-breakpoint
ALTER TABLE ownership_transfers ADD CONSTRAINT ownership_transfers_new_owner_user_id_users_id_fk FOREIGN KEY (new_owner_user_id) REFERENCES public.users (id);
--> statement-breakpoint
CREATE UNIQUE INDEX ownership_transfers_one_pending_key
  ON ownership_transfers (store_id)
  WHERE ownership_transfers.status = 'pending';
--> statement-breakpoint
CREATE INDEX ownership_transfers_store_id_idx
  ON ownership_transfers (store_id);
--> statement-breakpoint
CREATE INDEX ownership_transfers_owner_user_id_idx
  ON ownership_transfers (owner_user_id);
--> statement-breakpoint
CREATE INDEX ownership_transfers_new_owner_user_id_idx
  ON ownership_transfers (new_owner_user_id);
--> statement-breakpoint
CREATE INDEX memberships_store_id_created_at_id_idx
  ON memberships (store_id, created_at, id);
--> statement-breakpoint
-- Written by hand below this line
ALTER TABLE "ownership_transfers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "ownership_transfers_isolation" ON "ownership_transfers"
USING ("store_id" = NULLIF(current_setting('app.store_id', TRUE), '')::uuid)
WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', TRUE), '')::uuid);
--> statement-breakpoint
CREATE FUNCTION public.user_store_page(target_user uuid, after_store uuid, page_limit integer)
RETURNS TABLE (store_id uuid, store_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT s.id, s.name
  FROM public.memberships m
  JOIN public.stores s ON s.id=m.store_id
  WHERE m.user_id=target_user AND m.status='active'
    AND (after_store IS NULL OR m.store_id>after_store)
  ORDER BY m.store_id
  LIMIT LEAST(GREATEST(page_limit, 1), 51)
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.user_store_page(uuid, uuid, integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.user_store_page(uuid, uuid, integer) TO dakly_app;
--> statement-breakpoint
CREATE FUNCTION public.user_store_context(target_user uuid, selected_store uuid)
RETURNS TABLE (has_memberships boolean, store_id uuid, store_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS(
    SELECT 1
    FROM public.memberships
    WHERE user_id=target_user AND status='active'
  ), chosen.id, chosen.name
  FROM (SELECT 1) singleton
  LEFT JOIN (
    SELECT s.id, s.name
    FROM public.memberships m
    JOIN public.stores s ON s.id=m.store_id
    WHERE m.user_id=target_user AND m.status='active' AND m.store_id=selected_store
  ) chosen ON TRUE
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.user_store_context(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.user_store_context(uuid, uuid) TO dakly_app;
