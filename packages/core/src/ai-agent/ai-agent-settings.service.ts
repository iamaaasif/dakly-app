import { Inject, Injectable } from '@nestjs/common';

import type {
  AgentSettingsResponse,
  AgentUsageResponse,
  SaveAgentSettingsInput,
} from '@dakly/contracts/ai-agent-settings';

import { AuditService } from '../audit/audit.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { UsageService } from '../usage/usage.service';
import { agentSettingsError } from './ai-agent-settings.errors';
import { AiAgentSettingsRepository } from './ai-agent-settings.repository';

@Injectable()
export class AiAgentSettingsService {
  constructor(
    @Inject(AiAgentSettingsRepository) private readonly settings: AiAgentSettingsRepository,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(UsageService) private readonly usage: UsageService,
  ) {}

  view(storeId: string) {
    return this.settings.view(storeId);
  }

  async aiUsage(storeId: string): Promise<AgentUsageResponse> {
    const { allowance, remaining, periodEnd } = await this.usage.summary(
      storeId,
      'ai_conversation',
    );
    return { allowance, remaining, periodEnd: periodEnd.toISOString() };
  }

  async save(storeId: string, userId: string, input: SaveAgentSettingsInput) {
    await this.transaction.run(storeId, async () => {
      const after = changeable(input);
      const before = changeable(await this.settings.view(storeId));
      if (!(await this.settings.save(storeId, userId, input, this.clock.now())))
        throw agentSettingsError('AI_AGENT_SETTINGS_CHANGED');
      await this.settings.recordChange(storeId, userId, {
        before,
        after,
        summary: 'Changed AI agent settings',
      });
      await this.audit.record(storeId, {
        actor: { kind: 'user', userId },
        action: 'ai_agent.settings_changed',
        entityType: 'ai_agent_settings',
        entityId: storeId,
        after: { changedFields: changedFields(before, after) },
      });
    });
    return this.settings.view(storeId);
  }
}

function changeable(settings: SaveAgentSettingsInput | AgentSettingsResponse) {
  return {
    isAutoReplyOn: settings.isAutoReplyOn,
    replyLanguage: settings.replyLanguage,
    abilities: settings.abilities,
    handoverRules: settings.handoverRules,
    returnToAiMinutes: settings.returnToAiMinutes,
    extraRules: settings.extraRules,
  };
}

function changedFields(before: Record<string, unknown>, after: Record<string, unknown>) {
  return Object.keys(after).filter(
    (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
  );
}
