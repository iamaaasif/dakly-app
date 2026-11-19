import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';

import type { TriggerKey } from '@dakly/contracts/automations/catalogue';
import { automationRuns, automations, automationVersions } from '@dakly/db/schema/automations';

import { TenantDatabase } from '../platform/database/tenant-database';

type NewRun = Pick<
  typeof automationRuns.$inferInsert,
  | 'automationId'
  | 'versionId'
  | 'contactId'
  | 'triggerKey'
  | 'currentStepKey'
  | 'enteredAt'
  | 'wakeAt'
>;

@Injectable()
export class AutomationEntryRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  activeWorkflows(storeId: string, trigger: TriggerKey) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({ id: automations.id })
        .from(automations)
        .where(
          and(
            eq(automations.storeId, storeId),
            eq(automations.triggerType, trigger),
            eq(automations.status, 'active'),
          ),
        ),
    );
  }

  async lockPublishedVersion(storeId: string, automationId: string) {
    const [version] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({
          id: automationVersions.id,
          graph: automationVersions.graph,
          publishedAt: automationVersions.publishedAt,
        })
        .from(automations)
        .innerJoin(
          automationVersions,
          and(
            eq(automationVersions.storeId, storeId),
            eq(automationVersions.automationId, automationId),
            eq(automationVersions.id, automations.publishedVersionId),
          ),
        )
        .where(
          and(
            eq(automations.storeId, storeId),
            eq(automations.id, automationId),
            eq(automations.status, 'active'),
            eq(automationVersions.isStopped, false),
          ),
        )
        .for('share', { of: automations }),
    );
    return version;
  }

  async previousEntry(storeId: string, automationId: string, contactId: string) {
    const active = sql<boolean>`${automationRuns.status} in ('waiting', 'running')`;
    const [run] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ active, enteredAt: automationRuns.enteredAt })
        .from(automationRuns)
        .where(
          and(
            eq(automationRuns.storeId, storeId),
            eq(automationRuns.automationId, automationId),
            eq(automationRuns.contactId, contactId),
          ),
        )
        .orderBy(desc(active), desc(automationRuns.enteredAt))
        .limit(1),
    );
    return run;
  }

  async insert(storeId: string, run: NewRun): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx
        .insert(automationRuns)
        .values({ ...run, storeId })
        .onConflictDoNothing({
          target: [
            automationRuns.automationId,
            automationRuns.contactId,
            automationRuns.triggerKey,
          ],
        }),
    );
  }
}
