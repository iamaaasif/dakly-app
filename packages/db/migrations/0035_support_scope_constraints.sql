CREATE INDEX IF NOT EXISTS "staff_audit_log_order_idx" ON "staff_audit_log" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "staff_audit_log_action_idx" ON "staff_audit_log" USING btree ("action","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "support_grants_store_id_id_key" ON "support_grants" USING btree ("store_id","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_grants_staff_id_idx" ON "support_grants" USING btree ("staff_user_id","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_grants_store_id_idx" ON "support_grants" USING btree ("store_id","id");--> statement-breakpoint
ALTER TABLE "support_grants" ADD CONSTRAINT "support_grants_duration" CHECK ("support_grants"."duration_minutes" between 30 and 1440);
--> statement-breakpoint
ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_grant_store_fk" FOREIGN KEY ("store_id","grant_id") REFERENCES "public"."support_grants"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
DROP POLICY store_isolation ON support_sessions;
CREATE POLICY support_sessions_isolation ON support_sessions USING (store_id = NULLIF(current_setting('app.store_id', true),'')::uuid) WITH CHECK (store_id = NULLIF(current_setting('app.store_id', true),'')::uuid);
