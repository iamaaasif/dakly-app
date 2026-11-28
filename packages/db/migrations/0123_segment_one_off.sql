DROP INDEX "segments_store_id_name_key";--> statement-breakpoint
ALTER TABLE "segments" ADD COLUMN "one_off" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "segments_store_id_name_key" ON "segments" USING btree ("store_id","name") WHERE not "segments"."one_off";