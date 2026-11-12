import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase } from './client';

async function run(): Promise<void> {
  const url = process.env.DATABASE_ADMIN_URL;
  if (!url) {
    throw new Error('DATABASE_ADMIN_URL is not set');
  }
  const { db, pool } = createDatabase(url);
  await migrate(db, { migrationsFolder: path.join(__dirname, '..', 'migrations') });
  await pool.end();
}

void run();
