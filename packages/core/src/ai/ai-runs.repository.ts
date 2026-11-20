import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { aiRuns } from '@dakly/db/schema/ai';

import { TenantDatabase } from '../platform/database/tenant-database';

export type AiRun = Omit<typeof aiRuns.$inferInsert, 'id' | 'storeId'>;

@Injectable()
export class AiRunsRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  async find(storeId: string, id: string) {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ purpose: aiRuns.purpose, outcome: aiRuns.outcome })
        .from(aiRuns)
        .where(and(eq(aiRuns.storeId, storeId), eq(aiRuns.id, id))),
    );
    return row;
  }

  async insert(storeId: string, run: AiRun): Promise<string> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .insert(aiRuns)
        .values({ ...run, storeId })
        .returning({ id: aiRuns.id }),
    );
    return row!.id;
  }

  async setOutcome(storeId: string, id: string, outcome: AiRun['outcome'], errorCode?: string) {
    await this.database.forStore(storeId, (tx) =>
      tx
        .update(aiRuns)
        .set({ outcome, errorCode: errorCode ?? null })
        .where(and(eq(aiRuns.storeId, storeId), eq(aiRuns.id, id))),
    );
  }
}
