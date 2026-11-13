-- citext for case-insensitive emails, vector for AI embeddings (pgvector), pg_trgm for name
-- search. All three are available on DigitalOcean managed PostgreSQL 16.
CREATE EXTENSION IF NOT EXISTS citext;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
