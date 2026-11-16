import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, gt, inArray, sql } from 'drizzle-orm';

import type { AutomationListQuery, AutomationStatus } from '@dakly/contracts/automations';
import type { AutomationGraph } from '@dakly/contracts/automations/graph';
import { automations, automationVersions } from '@dakly/db/schema/automations';

import { isConstraintViolation } from '../platform/database/error-code';
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

export type AutomationVersion = {
  id: string;
  version: number;
  isStopped: boolean;
  publishedAt: Date;
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

const versionColumns = {
  id: automationVersions.id,
  version: automationVersions.version,
  isStopped: automationVersions.isStopped,
  publishedAt: automationVersions.publishedAt,
};

type Transition = {
  status?: AutomationStatus;
  name?: string;
  graph?: AutomationGraph;
  publishedVersionId?: string;
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
    automation: { name: string; graph: AutomationGraph; createdByUserId: string | null },
  ): Promise<Automation> {
    const { graph, ...rest } = automation;
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .insert(automations)
        .values({ storeId, ...rest, draftGraph: graph, triggerType: graph.trigger.key })
        .returning(automationColumns),
    );
    return row!;
  }

  // Changes the row only while it is in one of the given statuses.
  async change(
    storeId: string,
    id: string,
    from: readonly AutomationStatus[],
    { graph, ...change }: Transition,
  ): Promise<Automation | undefined> {
    const draft = graph ? { draftGraph: graph, triggerType: graph.trigger.key } : {};
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .update(automations)
        .set({ ...change, ...draft })
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

  // Two publishes at once compute the same number; the unique index refuses the second.
  async insertVersion(
    storeId: string,
    automationId: string,
    version: { graph: AutomationGraph; publishedByUserId: string | null; publishedAt: Date },
  ): Promise<AutomationVersion | 'version_taken'> {
    const next = sql<number>`(select coalesce(max(${automationVersions.version}), 0) + 1
      from ${automationVersions} where ${automationVersions.storeId} = ${storeId}
      and ${automationVersions.automationId} = ${automationId})`;
    try {
      const [row] = await this.database.forStore(storeId, (tx) =>
        tx
          .insert(automationVersions)
          .values({ storeId, automationId, version: next, ...version })
          .returning(versionColumns),
      );
      return row!;
    } catch (error) {
      if (isConstraintViolation(error, '23505', 'automation_versions_automation_version_key'))
        return 'version_taken';
      throw error;
    }
  }

  listVersions(storeId: string, automationId: string): Promise<AutomationVersion[]> {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select(versionColumns)
        .from(automationVersions)
        .where(
          and(
            eq(automationVersions.storeId, storeId),
            eq(automationVersions.automationId, automationId),
          ),
        )
        .orderBy(asc(automationVersions.version)),
    );
  }

  // is_stopped is the only column the app role may update on a version.
  async stopVersion(storeId: string, automationId: string, versionId: string): Promise<boolean> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .update(automationVersions)
        .set({ isStopped: true })
        .where(
          and(
            eq(automationVersions.storeId, storeId),
            eq(automationVersions.automationId, automationId),
            eq(automationVersions.id, versionId),
          ),
        )
        .returning({ id: automationVersions.id }),
    );
    return rows.length > 0;
  }
}
