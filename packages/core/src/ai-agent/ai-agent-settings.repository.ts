import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import {
  agentAbilitiesSchema,
  defaultAgentAbilities,
  defaultHandoverRules,
  handoverRulesSchema,
  type AgentSettingsResponse,
  type SaveAgentSettingsInput,
} from '@dakly/contracts/ai-agent-settings';
import {
  testersSchema,
  testQuestionsSchema,
  type TestQuestion,
} from '@dakly/contracts/ai-practice';
import { aiAgentSettings, aiRuleChanges } from '@dakly/db/schema/ai';

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
          abilities: aiAgentSettings.abilities,
        })
        .from(aiAgentSettings)
        .where(and(eq(aiAgentSettings.storeId, storeId), eq(aiAgentSettings.isAutoReplyOn, true))),
    );
    if (!settings) return undefined;
    const { productCardStyle, takeOrders } = agentAbilitiesSchema
      .partial()
      .parse(settings.abilities);
    return {
      debounceSeconds: settings.debounceSeconds,
      testers: testersSchema.parse(settings.testers),
      claimTimeoutMinutes: settings.claimTimeoutMinutes,
      returnToAiMinutes: settings.returnToAiMinutes,
      productCardStyle: productCardStyle ?? defaultAgentAbilities.productCardStyle,
      takeOrders: takeOrders ?? defaultAgentAbilities.takeOrders,
    };
  }

  async testers(storeId: string): Promise<string[]> {
    const [settings] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ testers: aiAgentSettings.testers })
        .from(aiAgentSettings)
        .where(eq(aiAgentSettings.storeId, storeId)),
    );
    return testersSchema.parse(settings?.testers ?? []);
  }

  async saveTesters(storeId: string, userId: string, contactIds: string[], now: Date) {
    await this.database.forStore(storeId, (tx) =>
      tx
        .insert(aiAgentSettings)
        .values({ storeId, testers: contactIds, updatedByUserId: userId, updatedAt: now })
        .onConflictDoUpdate({
          target: aiAgentSettings.storeId,
          set: {
            testers: contactIds,
            version: sql`${aiAgentSettings.version} + 1`,
            updatedByUserId: userId,
            updatedAt: now,
          },
        }),
    );
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

  async view(storeId: string): Promise<AgentSettingsResponse> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx.select().from(aiAgentSettings).where(eq(aiAgentSettings.storeId, storeId)),
    );
    return row ? toResponse(row) : unsavedSettings;
  }

  // Returns false when the row changed since the person loaded it.
  async save(
    storeId: string,
    userId: string,
    input: SaveAgentSettingsInput,
    now: Date,
  ): Promise<boolean> {
    const values = {
      isAutoReplyOn: input.isAutoReplyOn,
      replyLanguage: input.replyLanguage,
      abilities: input.abilities,
      handoverRules: input.handoverRules,
      returnToAiMinutes: input.returnToAiMinutes,
      extraRules: input.extraRules,
      updatedByUserId: userId,
      updatedAt: now,
    };
    return this.database.forStore(storeId, async (tx) => {
      if (input.version === 0) {
        const created = await tx
          .insert(aiAgentSettings)
          .values({ storeId, ...values })
          .onConflictDoNothing()
          .returning({ storeId: aiAgentSettings.storeId });
        return created.length === 1;
      }
      const updated = await tx
        .update(aiAgentSettings)
        .set({ ...values, version: sql`${aiAgentSettings.version} + 1` })
        .where(
          and(eq(aiAgentSettings.storeId, storeId), eq(aiAgentSettings.version, input.version)),
        )
        .returning({ storeId: aiAgentSettings.storeId });
      return updated.length === 1;
    });
  }

  async recordChange(
    storeId: string,
    userId: string,
    change: { before: object; after: object; summary: string },
  ) {
    await this.database.forStore(storeId, (tx) =>
      tx.insert(aiRuleChanges).values({
        storeId,
        source: 'settings_edit',
        target: 'ai_agent_settings',
        changedByUserId: userId,
        ...change,
      }),
    );
  }
}

// Only the choices on the screen are offered; the engine's 30 minute default shows as 1 hour.
function choice(minutes: number | null): 60 | 1440 | null {
  if (minutes === null) return null;
  return minutes === 1440 ? 1440 : 60;
}

const unsavedSettings: AgentSettingsResponse = {
  version: 0,
  isAutoReplyOn: false,
  replyLanguage: 'match_customer',
  abilities: defaultAgentAbilities,
  handoverRules: defaultHandoverRules,
  returnToAiMinutes: 60,
  extraRules: null,
  handoverRulesSaved: false,
};

function toResponse(row: typeof aiAgentSettings.$inferSelect): AgentSettingsResponse {
  const handoverRulesSaved = Object.keys(row.handoverRules ?? {}).length > 0;
  return {
    version: row.version,
    isAutoReplyOn: row.isAutoReplyOn,
    replyLanguage: row.replyLanguage,
    abilities: { ...defaultAgentAbilities, ...agentAbilitiesSchema.partial().parse(row.abilities) },
    handoverRules: handoverRulesSaved
      ? handoverRulesSchema.parse(row.handoverRules)
      : defaultHandoverRules,
    returnToAiMinutes: choice(row.returnToAiMinutes),
    extraRules: row.extraRules,
    handoverRulesSaved,
  };
}
