-- Partitions cannot resolve a column qualified with the parent's name, so the check names the bare column.
ALTER TABLE "ai_runs" DROP CONSTRAINT "ai_runs_purpose";--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "photo_description" text;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "photo_tags" text[];--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_purpose" CHECK ("purpose" in ('chat_reply', 'classify', 'comment_reply', 'summary', 'transcribe', 'describe_image', 'content', 'ask', 'segment_rules', 'voice_add', 'teach', 'embedding', 'contact_memory', 'grade_test', 'tag_product_photo'));