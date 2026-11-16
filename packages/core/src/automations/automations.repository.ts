import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, gt, inArray } from 'drizzle-orm';

import type { AutomationListQuery, AutomationStatus } from '@dakly/contracts/automations';
import type { TriggerKey } from '@dakly/contracts/automations/catalogue';
import type { AutomationGraph } from '@dakly/contracts/automations/graph';
import { automations } from '@dakly/db/schema/automations';

import { TenantDatabase } from '../platform/database/tenant-database';

export type Automation = {
  id: string;
  name: string;
  status: AutomationStatus;
  graph: AutomationGraph;
  publishedVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const automationColumns = {
  id: automations.id,
  name: automations.name,
  status: automations.status,
  graph: automations.draftGraph,
  publishedVersionId: automations.publishedVersionId,
  createdAt: automations.createdAt,
  updatedAt: automations.updatedAt,
};

type AutomationChange = {
  status?: AutomationStatus;
  name?: string;
  graph?: AutomationGraph;
  updatedAt: Date;
};

@Injectable()
export class AutomationsRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  list(
    storeId: string,
    statuses: readonly AutomationStatus[],
    query: AutomationListQuery,
  ): Promise<Automation[]> {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select(automationColumns)
        .from(automations)
        .where(
          and(
            eq(automations.storeId, storeId),
            inArray(automations.status, statuses),
            query.cursor ? gt(automations.id, query.cursor) : undefined,
          ),
        )
        .orderBy(asc(automations.id))
        .limit(query.limit + 1),
    );
  }

  async find(storeId: string, id: string): Promise<Automation | undefined> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select(automationColumns)
        .from(automations)
        .where(and(eq(automations.storeId, storeId), eq(automations.id, id)))
        .limit(1),
    );
    return row;
  }

  async countWithStatus(storeId: string, statuses: readonly AutomationStatus[]): Promise<number> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ count: count() })
        .from(automations)
        .where(and(eq(automations.storeId, storeId), inArray(automations.status, statuses))),
    );
    return row!.count;
  }

  async insert(
    storeId: string,
    automation: {
      name: string;
      graph: AutomationGraph;
      triggerType: TriggerKey;
      createdByUserId: string | null;
    },
  ): Promise<Automation> {
    const { graph, ...rest } = automation;
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .insert(automations)
        .values({ storeId, ...rest, draftGraph: graph })
        .returning(automationColumns),
    );
    return row!;
  }

  async change(
    storeId: string,
    id: string,
    from: readonly AutomationStatus[],
    { graph, ...change }: AutomationChange,
  ): Promise<Automation | undefined> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .update(automations)
        .set({ ...change, ...(graph && { draftGraph: graph }) })
        .where(
          and(
            eq(automations.storeId, storeId),
            eq(automations.id, id),
            inArray(automations.status, from),
          ),
        )
        .returning(automationColumns),
    );
    return row;
  }
}
