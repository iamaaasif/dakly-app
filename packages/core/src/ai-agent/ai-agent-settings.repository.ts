import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { aiAgentSettings } from '@dakly/db/schema/ai';

import { TenantDatabase } from '../platform/database/tenant-database';

@Injectable()
export class AiAgentSettingsRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  async enabled(storeId: string) {
    const [settings] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({
          debounceSeconds: aiAgentSettings.debounceSeconds,
          claimTimeoutMinutes: aiAgentSettings.claimTimeoutMinutes,
          returnToAiMinutes: aiAgentSettings.returnToAiMinutes,
        })
        .from(aiAgentSettings)
        .where(and(eq(aiAgentSettings.storeId, storeId), eq(aiAgentSettings.isAutoReplyOn, true))),
    );
    return settings;
  }
}
