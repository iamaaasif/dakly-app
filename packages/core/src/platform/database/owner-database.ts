import { Injectable, type OnApplicationShutdown } from '@nestjs/common';

import { createDatabase } from '@dakly/db/client';

import { loadEnv } from '../config/env';

// The table owner's connection, for the few steps the app role is not allowed to do: dropping
// an audit month and purging account history. RLS does not apply to it, so callers filter by
// store themselves. The pool opens on first use, so processes that never archive hold no
// connection.
@Injectable()
export class OwnerDatabase implements OnApplicationShutdown {
  private connection: ReturnType<typeof createDatabase> | undefined;

  get db() {
    const url = loadEnv().DATABASE_ADMIN_URL;
    if (!url) throw new Error('DATABASE_ADMIN_URL is required for the maintenance archive');
    this.connection ??= createDatabase(url);
    return this.connection.db;
  }

  async onApplicationShutdown() {
    await this.connection?.pool.end();
  }
}
