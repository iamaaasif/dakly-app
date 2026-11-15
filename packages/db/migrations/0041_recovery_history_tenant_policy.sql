-- Match other tenant tables: the non-owner app role obeys RLS, while migrations can backfill.
ALTER TABLE public.staff_recovery_history NO FORCE ROW LEVEL SECURITY;
ALTER POLICY tenant_isolation ON public.staff_recovery_history
 USING (store_id = nullif(current_setting('app.store_id', true), '')::uuid)
 WITH CHECK (store_id = nullif(current_setting('app.store_id', true), '')::uuid);
