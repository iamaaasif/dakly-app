import { StaffDatabase } from './staff-database';
import { StaffTransaction } from './staff-transaction';
import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { createDatabase } from '@dakly/db/client';
import { loadEnv } from '../config/env';
import { DATABASE, DATABASE_CONNECTION } from './database.tokens';
import { AccountDatabase } from './account-database';
import { AccountTransaction } from './account-transaction';
import { StoreTransaction } from './store-transaction';
import { TenantDatabase } from './tenant-database';

type Connection = ReturnType<typeof createDatabase>;

@Injectable()
class DatabaseShutdown implements OnApplicationShutdown {
  constructor(@Inject(DATABASE_CONNECTION) private readonly connection: Connection) {}

  onApplicationShutdown(): Promise<void> {
    return this.connection.pool.end();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_CONNECTION,
      useFactory: (): Connection => createDatabase(loadEnv().DATABASE_URL),
    },
    {
      provide: DATABASE,
      useFactory: (connection: Connection) => connection.db,
      inject: [DATABASE_CONNECTION],
    },
    DatabaseShutdown,
    TenantDatabase,
    StoreTransaction,
    AccountDatabase,
    AccountTransaction,
    StaffDatabase,
    StaffTransaction,
  ],
  exports: [
    StaffDatabase,
    StaffTransaction,
    DATABASE,
    TenantDatabase,
    StoreTransaction,
    AccountDatabase,
    AccountTransaction,
  ],
})
export class DatabaseModule {}
