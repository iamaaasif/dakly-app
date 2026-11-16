import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import {
  type AutomationListQuery,
  type AutomationListResponse,
  type AutomationResponse,
  type ChangeAutomationInput,
  type CreateAutomationInput,
  MAX_AUTOMATIONS_PER_STORE,
} from '@dakly/contracts/automations';

import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { automationError } from './automations.errors';
import { type Automation, AutomationsRepository } from './automations.repository';

type Actor = AuditEntry['actor'];

// An archived workflow is deleted for the shop; its versions stay for the runs on them.
const VISIBLE_STATUSES = ['draft', 'active', 'paused'] as const;

@Injectable()
export class AutomationsService {
  constructor(
    @Inject(AutomationsRepository) private readonly repository: AutomationsRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async list(storeId: string, query: AutomationListQuery): Promise<AutomationListResponse> {
    const rows = await this.repository.list(storeId, VISIBLE_STATUSES, query);
    const items = rows.slice(0, query.limit).map(toAutomationResponse);
    return { items, nextCursor: rows.length > query.limit ? items.at(-1)!.id : null };
  }

  async get(storeId: string, automationId: string): Promise<AutomationResponse> {
    return toAutomationResponse(await this.findVisible(storeId, automationId));
  }

  // The store lock makes the 100-workflow limit hold under concurrent creates.
  async create(
    storeId: string,
    input: CreateAutomationInput,
    actor: Actor,
  ): Promise<AutomationResponse> {
    return this.transaction.runLocked(storeId, async () => {
      if (
        (await this.repository.countWithStatus(storeId, VISIBLE_STATUSES)) >=
        MAX_AUTOMATIONS_PER_STORE
      )
        throw automationError('AUTOMATION_LIMIT_REACHED');
      const automation = await this.repository.insert(storeId, {
        ...input,
        createdByUserId: actor.kind === 'user' ? actor.userId : null,
      });
      return toAutomationResponse(automation);
    });
  }

  // The draft changes freely, also while a version is live; Publish copies it.
  async change(
    storeId: string,
    automationId: string,
    input: ChangeAutomationInput,
    _actor: Actor,
  ): Promise<AutomationResponse> {
    const automation = await this.repository.change(storeId, automationId, VISIBLE_STATUSES, {
      ...input,
      updatedAt: this.clock.now(),
    });
    if (!automation) throw automationError('AUTOMATION_NOT_FOUND');
    return toAutomationResponse(automation);
  }

  async archive(storeId: string, automationId: string, _actor: Actor): Promise<void> {
    const automation = await this.repository.change(storeId, automationId, VISIBLE_STATUSES, {
      status: 'archived',
      updatedAt: this.clock.now(),
    });
    if (!automation) throw automationError('AUTOMATION_NOT_FOUND');
  }

  private async findVisible(storeId: string, automationId: string): Promise<Automation> {
    const automation = await this.repository.find(storeId, automationId);
    if (!automation || automation.status === 'archived')
      throw automationError('AUTOMATION_NOT_FOUND');
    return automation;
  }
}

function toAutomationResponse(automation: Automation): AutomationResponse {
  return {
    ...automation,
    triggerKey: automation.graph.trigger.key,
    createdAt: automation.createdAt.toISOString(),
    updatedAt: automation.updatedAt.toISOString(),
  };
}
