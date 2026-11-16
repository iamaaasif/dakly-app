-- The customers example becomes contacts (CUS-1). Ids are kept so audit rows still point at the
-- same person. A phone the store already has on a contact stays with that contact.
INSERT INTO "contacts" ("id", "store_id", "name", "phone", "source", "kind", "created_at")
SELECT "id", "store_id", "name", "phone", 'manual', 'customer', "created_at" FROM "customers"
ON CONFLICT DO NOTHING;
