import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { customers } from './schema/customers';
import { stores } from './schema/stores';

const schema = { stores, customers };

export type Database = NodePgDatabase<typeof schema>;

export function createDatabase(connectionString: string): { db: Database; pool: Pool } {
  const pool = new Pool({ connectionString });
  return { db: drizzle(pool, { schema }), pool };
}
