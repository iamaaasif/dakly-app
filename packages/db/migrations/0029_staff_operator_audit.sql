ALTER TABLE "staff_audit_log" ALTER COLUMN "staff_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_audit_log" ADD COLUMN "operator_identity" text;--> statement-breakpoint
ALTER TABLE "staff_audit_log" ADD CONSTRAINT "staff_audit_log_actor" CHECK (("staff_audit_log"."staff_user_id" is not null) <> ("staff_audit_log"."operator_identity" is not null));