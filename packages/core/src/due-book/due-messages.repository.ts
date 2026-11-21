import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, inArray } from 'drizzle-orm';

import type {
  DueMessageKind,
  DueMessageSkipReason,
  DueMessageStatus,
} from '@dakly/contracts/due-book';
import { dueMessages } from '@dakly/db/schema/due-book';

import { TenantDatabase } from '../platform/database/tenant-database';

export type DueMessage = {
  id: string;
  contactId: string;
  kind: DueMessageKind;
  entryId: string | null;
  body: string;
  status: DueMessageStatus;
  skipReason: DueMessageSkipReason | null;
  credits: number | null;
  providerMessageId: string | null;
  createdAt: Date;
};

export type NewDueMessage = {
  contactId: string;
  kind: DueMessageKind;
  entryId?: string;
  body: string;
  requestedByUserId?: string;
};

export type DueMessageChange = Partial<
  Pick<DueMessage, 'status' | 'skipReason' | 'credits' | 'providerMessageId'> & { sentAt: Date }
>;

const dueMessageColumns = {
  id: dueMessages.id,
  contactId: dueMessages.contactId,
  kind: dueMessages.kind,
  entryId: dueMessages.entryId,
  body: dueMessages.body,
  status: dueMessages.status,
  skipReason: dueMessages.skipReason,
  credits: dueMessages.credits,
  providerMessageId: dueMessages.providerMessageId,
  createdAt: dueMessages.createdAt,
};

// A reminder counts against the 7-day limit from the moment it is asked for, unless it was
// refused, so a queued one blocks a second tap.
const COUNTED_STATUSES = ['queued', 'sending', 'sent'] as const;

@Injectable()
export class DueMessagesRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  // A baki has one notice; asking again returns nothing and the caller reads the first.
  async insert(storeId: string, message: NewDueMessage): Promise<DueMessage | undefined> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .insert(dueMessages)
        .values({ storeId, ...message })
        .onConflictDoNothing()
        .returning(dueMessageColumns),
    );
    return row;
  }

  async findById(storeId: string, id: string): Promise<DueMessage | undefined> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select(dueMessageColumns)
        .from(dueMessages)
        .where(and(eq(dueMessages.storeId, storeId), eq(dueMessages.id, id))),
    );
    return row;
  }

  async findByEntry(storeId: string, entryId: string): Promise<DueMessage | undefined> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select(dueMessageColumns)
        .from(dueMessages)
        .where(and(eq(dueMessages.storeId, storeId), eq(dueMessages.entryId, entryId))),
    );
    return row;
  }

  async change(storeId: string, id: string, change: DueMessageChange): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx
        .update(dueMessages)
        .set(change)
        .where(and(eq(dueMessages.storeId, storeId), eq(dueMessages.id, id))),
    );
  }

  async remindedSince(storeId: string, contactIds: string[], since: Date): Promise<Set<string>> {
    if (!contactIds.length) return new Set();
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .selectDistinct({ contactId: dueMessages.contactId })
        .from(dueMessages)
        .where(
          and(
            eq(dueMessages.storeId, storeId),
            eq(dueMessages.kind, 'reminder'),
            inArray(dueMessages.contactId, contactIds),
            inArray(dueMessages.status, COUNTED_STATUSES),
            gte(dueMessages.createdAt, since),
          ),
        ),
    );
    return new Set(rows.map((row) => row.contactId));
  }
}
