import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import {
  testersSchema,
  testQuestionsSchema,
  type TestQuestion,
} from '@dakly/contracts/ai-practice';
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
          testers: aiAgentSettings.testers,
          claimTimeoutMinutes: aiAgentSettings.claimTimeoutMinutes,
          returnToAiMinutes: aiAgentSettings.returnToAiMinutes,
        })
        .from(aiAgentSettings)
        .where(and(eq(aiAgentSettings.storeId, storeId), eq(aiAgentSettings.isAutoReplyOn, true))),
    );
    return settings && { ...settings, testers: testersSchema.parse(settings.testers) };
  }

  async practice(storeId: string) {
    const [settings] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({
          handoverRules: aiAgentSettings.handoverRules,
          testQuestions: aiAgentSettings.testQuestions,
        })
        .from(aiAgentSettings)
        .where(eq(aiAgentSettings.storeId, storeId)),
    );
    return {
      hasHandoverRules: Object.keys(settings?.handoverRules ?? {}).length > 0,
      testQuestions: testQuestionsSchema.parse(settings?.testQuestions ?? []),
    };
  }

  async saveTestQuestions(
    storeId: string,
    userId: string,
    questions: TestQuestion[],
    now: Date,
  ): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx
        .insert(aiAgentSettings)
        .values({ storeId, testQuestions: questions, updatedByUserId: userId, updatedAt: now })
        .onConflictDoUpdate({
          target: aiAgentSettings.storeId,
          set: {
            testQuestions: questions,
            version: sql`${aiAgentSettings.version} + 1`,
            updatedByUserId: userId,
            updatedAt: now,
          },
        }),
    );
  }
}
