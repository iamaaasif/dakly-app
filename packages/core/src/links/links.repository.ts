import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, inArray, isNotNull, lte, sql } from 'drizzle-orm';

import type { TrackedLinkKind, TrackedLinkSourceType } from '@dakly/contracts/campaigns';
import type { Database } from '@dakly/db/client';
import { trackedLinks, trackedLinkVisits } from '@dakly/db/schema/campaigns';

import { DATABASE } from '../platform/database/database.tokens';
import type { Transaction } from '../platform/database/scoped-transactions';
import { TenantDatabase } from '../platform/database/tenant-database';

type LinkSource = {
  contactId: string | null;
  sourceType: TrackedLinkSourceType;
  sourceId: string | null;
};

export type NewTrackedLinkRow = LinkSource & {
  id: string;
  code: string;
  kind: TrackedLinkKind;
  targetUrl: string | null;
};

export type RedirectTap = LinkSource & { targetUrl: string; tapCount: number };
export type OptOutLink = LinkSource & { contactId: string };
export type Visit = { eventKey: string; occurredAt: Date; visitorHash: Buffer };

// The schema's kind checks make target_url set on every redirect and contact_id on every opt-out.
const sourceColumns = {
  contactId: trackedLinks.contactId,
  sourceType: trackedLinks.sourceType,
  sourceId: trackedLinks.sourceId,
};

@Injectable()
export class LinksRepository {
  constructor(
    @Inject(TenantDatabase) private readonly tenant: TenantDatabase,
    @Inject(DATABASE) private readonly database: Database,
  ) {}

  // A public link names no store, so a SECURITY DEFINER function finds it by its code.
  async locate(code: string): Promise<{ storeId: string; trackedLinkId: string } | undefined> {
    const result = await this.database.execute<{ storeId: string; trackedLinkId: string }>(
      sql`select store_id as "storeId", tracked_link_id as "trackedLinkId" from tracked_link_for_code(${code})`,
    );
    return result.rows[0];
  }

  async findOrderConfirmCode(storeId: string, orderId: string): Promise<string | undefined> {
    const [row] = await this.tenant.forStore(storeId, (tx) =>
      tx
        .select({ code: trackedLinks.code })
        .from(trackedLinks)
        .where(
          and(
            eq(trackedLinks.storeId, storeId),
            eq(trackedLinks.kind, 'order_confirm'),
            eq(trackedLinks.sourceType, 'order'),
            eq(trackedLinks.sourceId, orderId),
          ),
        )
        .limit(1),
    );
    return row?.code;
  }

  // A code taken by another link is skipped, so the caller sees which rows it must retry.
  async insert(storeId: string, links: NewTrackedLinkRow[]): Promise<string[]> {
    const rows = await this.tenant.forStore(storeId, (tx) =>
      tx
        .insert(trackedLinks)
        .values(links.map((link) => ({ ...link, storeId })))
        .onConflictDoNothing({ target: trackedLinks.code })
        .returning({ id: trackedLinks.id }),
    );
    return rows.map((row) => row.id);
  }

  attributionTaps(
    storeId: string,
    orders: { orderId: string; contactId: string; fromAt: Date; throughAt: Date }[],
  ) {
    return this.tenant.forStore(storeId, (tx) => {
      const requests = sql`jsonb_to_recordset(${JSON.stringify(orders)}::jsonb) as request(
        "orderId" uuid, "contactId" uuid, "fromAt" timestamptz, "throughAt" timestamptz
      )`;
      const latestVisit = tx
        .select({ id: trackedLinkVisits.id, eligibleAt: trackedLinkVisits.occurredAt })
        .from(trackedLinkVisits)
        .where(
          and(
            eq(trackedLinkVisits.storeId, storeId),
            eq(trackedLinkVisits.trackedLinkId, trackedLinks.id),
            gte(trackedLinkVisits.occurredAt, sql`request."fromAt"`),
            lte(trackedLinkVisits.occurredAt, sql`request."throughAt"`),
          ),
        )
        .orderBy(desc(trackedLinkVisits.occurredAt), desc(trackedLinkVisits.id))
        .limit(1)
        .as('latest_visit');
      return tx
        .select({
          orderId: sql<string>`request."orderId"`,
          contactId: sql<string>`request."contactId"`,
          id: latestVisit.id,
          eligibleAt: latestVisit.eligibleAt,
          sourceType: trackedLinks.sourceType,
          sourceId: trackedLinks.sourceId,
        })
        .from(requests)
        .innerJoin(trackedLinks, eq(trackedLinks.contactId, sql`request."contactId"`))
        .innerJoinLateral(latestVisit, sql`true`)
        .where(
          and(
            eq(trackedLinks.storeId, storeId),
            eq(trackedLinks.kind, 'redirect'),
            isNotNull(trackedLinks.sourceId),
            inArray(trackedLinks.sourceType, ['campaign', 'automation']),
          ),
        );
    });
  }

  async recordRedirectTap(
    storeId: string,
    trackedLinkId: string,
    visit: Visit,
  ): Promise<RedirectTap | undefined> {
    return this.tenant.forStore(storeId, async (tx) => {
      const [tap] = await tx
        .update(trackedLinks)
        .set({
          tapCount: sql`${trackedLinks.tapCount} + 1`,
          firstTappedAt: sql`coalesce(${trackedLinks.firstTappedAt}, ${visit.occurredAt})`,
          lastTappedAt: visit.occurredAt,
        })
        .where(
          and(
            eq(trackedLinks.storeId, storeId),
            eq(trackedLinks.id, trackedLinkId),
            eq(trackedLinks.kind, 'redirect'),
          ),
        )
        .returning({
          ...sourceColumns,
          targetUrl: sql<string>`${trackedLinks.targetUrl}`,
          tapCount: trackedLinks.tapCount,
        });
      if (!tap) return undefined;
      await tx.insert(trackedLinkVisits).values({ storeId, trackedLinkId, ...visit });
      return tap;
    });
  }

  async findOptOutLink(storeId: string, trackedLinkId: string): Promise<OptOutLink | undefined> {
    const [link] = await this.tenant.forStore(storeId, (tx) =>
      selectOptOutLink(tx, storeId, trackedLinkId),
    );
    return link;
  }

  // The row lock makes a second tap on the same link wait until the first one has committed.
  async lockOptOutLink(storeId: string, trackedLinkId: string): Promise<OptOutLink | undefined> {
    const [link] = await this.tenant.forStore(storeId, (tx) =>
      selectOptOutLink(tx, storeId, trackedLinkId).for('update'),
    );
    return link;
  }
}

function selectOptOutLink(tx: Transaction, storeId: string, trackedLinkId: string) {
  return tx
    .select({ ...sourceColumns, contactId: sql<string>`${trackedLinks.contactId}` })
    .from(trackedLinks)
    .where(
      and(
        eq(trackedLinks.storeId, storeId),
        eq(trackedLinks.id, trackedLinkId),
        eq(trackedLinks.kind, 'sms_opt_out'),
      ),
    );
}
