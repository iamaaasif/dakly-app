import { Inject, Injectable } from '@nestjs/common';

import { aiRuns } from '@dakly/db/schema/ai';

import { TenantDatabase } from '../platform/database/tenant-database';

export type AiRun = Omit<typeof aiRuns.$inferInsert, 'id' | 'storeId'>;

@Injectable()
export class AiRunsRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  async insert(storeId: string, run: AiRun): Promise<string> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .insert(aiRuns)
        .values({ ...run, storeId })
        .returning({ id: aiRuns.id }),
    );
    return row!.id;
  }
}
