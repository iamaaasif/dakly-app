import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, gt, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';

import type {
  AutomationListQuery,
  AutomationPauseReason,
  AutomationStatus,
} from '@dakly/contracts/automations';
import type { TriggerKey } from '@dakly/contracts/automations/catalogue';
import type { AutomationGraph } from '@dakly/contracts/automations/graph';
import { automationRuns, automations, automationVersions } from '@dakly/db/schema/automations';

import { TenantDatabase } from '../platform/database/tenant-database';
import { workflowSchedulerTime } from './workflow-scheduler-time.repository';

export type Automation = {
  id: string;
  name: string;
  status: AutomationStatus;
  pauseReason: AutomationPauseReason | null;
  templateKey: string | null;
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
  pauseReason: automations.pauseReason,
  templateKey: automations.templateKey,
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

type AutomationChange = {
  status?: AutomationStatus;
  pauseReason?: AutomationPauseReason | null;
  hasBalanceResumeSendAllowance?: boolean;
  name?: string;
  graph?: AutomationGraph;
  triggerType?: TriggerKey;
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
    since: Date,
  ) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({
          ...automationColumns,
          publishedGraph: automationVersions.graph,
          enteredLast30Days: sql<number>`(
            select count(*)::int from ${automationRuns}
            where ${automationRuns.storeId} = ${storeId}
              and ${automationRuns.automationId} = ${automations.id}
              and ${automationRuns.enteredAt} >= ${since}
          )`,
        })
        .from(automations)
        .leftJoin(
          automationVersions,
          and(
            eq(automationVersions.storeId, storeId),
            eq(automationVersions.id, automations.publishedVersionId),
          ),
        )
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

  async countActiveRuns(storeId: string, automationId: string): Promise<number> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ count: count() })
        .from(automationRuns)
        .where(
          and(
            eq(automationRuns.storeId, storeId),
            eq(automationRuns.automationId, automationId),
            inArray(automationRuns.status, ['waiting', 'running']),
          ),
        ),
    );
    return row!.count;
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
      templateKey?: string;
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
    { id, from }: { id: string; from: readonly AutomationStatus[] },
    { graph, ...change }: AutomationChange,
    unlessPausedFor?: AutomationPauseReason,
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
            unlessPausedFor &&
              or(
                ne(automations.status, 'paused'),
                isNull(automations.pauseReason),
                ne(automations.pauseReason, unlessPausedFor),
              ),
          ),
        )
        .returning(automationColumns),
    );
    return row;
  }

  async schedulerTime(storeId: string): Promise<Date> {
    return this.database.forStore(storeId, workflowSchedulerTime);
  }

  // The sender still holds the SMS wallet lock from its failed reservation.
  async pauseForBalance(
    storeId: string,
    id: string,
    observedRevision: number,
    updatedAt: Date,
  ): Promise<Automation | undefined> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .update(automations)
        .set({
          status: 'paused',
          pauseReason: 'balance',
          balancePauseRevision: observedRevision,
          hasBalanceResumeSendAllowance: false,
          updatedAt,
        })
        .where(
          and(
            eq(automations.storeId, storeId),
            eq(automations.id, id),
            eq(automations.status, 'active'),
          ),
        )
        .returning(automationColumns),
    );
    return row;
  }

  async lockBalancePaused(storeId: string, creditedRevision: number): Promise<string[]> {
    const rows = await this.database.inTransaction(storeId, (tx) =>
      tx
        .select({ id: automations.id })
        .from(automations)
        .where(
          and(
            eq(automations.storeId, storeId),
            eq(automations.status, 'paused'),
            eq(automations.pauseReason, 'balance'),
            lt(automations.balancePauseRevision, creditedRevision),
          ),
        )
        .orderBy(asc(automations.id))
        .for('update'),
    );
    return rows.map(({ id }) => id);
  }

  // The caller took these locks before reading the time that ends their pauses.
  async resumeBalancePaused(storeId: string, ids: string[], resumedAt: Date): Promise<void> {
    await this.database.inTransaction(storeId, (tx) =>
      tx
        .update(automations)
        .set({
          status: 'active',
          pauseReason: null,
          balancePauseRevision: null,
          balanceResumedAt: resumedAt,
          hasBalanceResumeSendAllowance: true,
          updatedAt: resumedAt,
        })
        .where(
          and(
            eq(automations.storeId, storeId),
            inArray(automations.id, ids),
            eq(automations.status, 'paused'),
            eq(automations.pauseReason, 'balance'),
          ),
        ),
    );
  }

  // The caller holds the workflow's row lock from its status update, so two publishes cannot
  // pick the same number.
  async insertVersion(
    storeId: string,
    automationId: string,
    version: { graph: AutomationGraph; publishedByUserId: string | null; publishedAt: Date },
  ): Promise<AutomationVersion> {
    const next = sql<number>`(select coalesce(max(${automationVersions.version}), 0) + 1
      from ${automationVersions} where ${automationVersions.storeId} = ${storeId}
      and ${automationVersions.automationId} = ${automationId})`;
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .insert(automationVersions)
        .values({ storeId, automationId, version: next, ...version })
        .returning(versionColumns),
    );
    return row!;
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
