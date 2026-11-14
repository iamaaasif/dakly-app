CREATE TABLE "staff_alert_deliveries" (
	"audit_id" uuid PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_id" uuid,
	"leased_until" timestamp with time zone,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error" text,
	"delivered_at" timestamp with time zone,
	CONSTRAINT "staff_alert_deliveries_status" CHECK ("staff_alert_deliveries"."status" in ('pending','delivered','failed')),
	CONSTRAINT "staff_alert_deliveries_attempts" CHECK ("staff_alert_deliveries"."attempts" between 0 and 5)
);
--> statement-breakpoint
ALTER TABLE "staff_alert_deliveries" ADD CONSTRAINT "staff_alert_deliveries_audit_id_staff_audit_log_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."staff_audit_log"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_alert_deliveries_pending_idx" ON "staff_alert_deliveries" USING btree ("next_attempt_at") WHERE "staff_alert_deliveries"."status" = 'pending';
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON staff_alert_deliveries TO dakly_app;
--> statement-breakpoint
DROP FUNCTION support_request_metadata(uuid,uuid);
--> statement-breakpoint
CREATE FUNCTION support_request_metadata(staff_id uuid,before_id uuid) RETURNS TABLE(id uuid,"staffName" text,"isBreakGlass" boolean,scopes text[],access text,status text,reason text,"durationMinutes" integer,"requestedAt" text,"expiresAt" text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
 SELECT g.id,u.name,g.is_break_glass,g.scopes,g.access,CASE WHEN (g.status='requested' AND g.requested_at<=clock_timestamp()-interval '30 minutes') OR (g.status='approved' AND g.expires_at<=clock_timestamp()) THEN 'expired' ELSE g.status END,g.reason,g.duration_minutes,to_char(g.requested_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),to_char(g.expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') FROM public.support_grants g JOIN public.staff_users u ON u.id=g.staff_user_id WHERE g.staff_user_id=staff_id AND (before_id IS NULL OR g.id<before_id) ORDER BY g.id DESC LIMIT 50
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION support_request_metadata(uuid,uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION support_request_metadata(uuid,uuid) TO dakly_app;
