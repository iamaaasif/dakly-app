-- The customers example becomes contacts (CUS-1). Ids are kept so audit rows still point at the
-- same person.
INSERT INTO "contacts" ("id", "store_id", "name", "phone", "source", "kind", "created_at")
SELECT "id", "store_id", "name", "phone", 'manual', 'customer', "created_at" FROM "customers"
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- 0030 drops customers, so stop here rather than lose a row that did not copy.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "customers" c LEFT JOIN "contacts" k ON k."id" = c."id" WHERE k."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'customers rows not copied';
  END IF;
END $$;
