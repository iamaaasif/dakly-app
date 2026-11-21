import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import {
  type CollectPaymentInput,
  type DueBalanceResponse,
  type DueCustomerListQuery,
  type DueCustomerListResponse,
  type DueCustomerResponse,
  type DueEntryResponse,
  type DueEntrySource,
  type DueHistoryQuery,
  type DueHistoryResponse,
  type DueSummaryResponse,
  OVERDUE_DAYS,
  type RecordBakiInput,
  type RecordedDueEntryResponse,
  type WriteOffInput,
} from '@dakly/contracts/due-book';
import { maskPhone } from '@dakly/contracts/phone';
import type { StoreAccess } from '@dakly/contracts/team';

import { ContactsService } from '../contacts/contacts.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { OutboxService } from '../platform/outbox/outbox.service';
import { DAY_MS } from '../platform/time';
import { TeamService } from '../team/team.service';
import { type DueBalance, DueBalancesRepository } from './due-balances.repository';
import { dueBookError } from './due-book.errors';
import { type DueEntry, DueEntriesRepository, type NewDueEntry } from './due-entries.repository';

type Actor = AuditEntry['actor'];
type UserActor = Extract<Actor, { kind: 'user' }>;
type Access = Pick<StoreAccess, 'seeFullPhone'>;
// A person at the counter, or an import that gives its own source.
type Recorder = { actor: Actor; source?: DueEntrySource };

const EVENT_TYPES = {
  baki: 'due.added',
  payment: 'due.payment_recorded',
  write_off: 'due.written_off',
} as const;

@Injectable()
export class DueBookService {
  constructor(
    @Inject(DueEntriesRepository) private readonly entries: DueEntriesRepository,
    @Inject(DueBalancesRepository) private readonly balances: DueBalancesRepository,
    @Inject(ContactsService) private readonly contacts: ContactsService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(TeamService) private readonly team: TeamService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  // The khata import calls this with source 'khata_import' and the date written on the page.
  recordBaki(
    storeId: string,
    contactId: string,
    input: RecordBakiInput,
    { actor, source = 'manual' }: Recorder,
  ): Promise<RecordedDueEntryResponse> {
    return this.inLockedTransaction(storeId, contactId, async (now) =>
      this.save(storeId, now, actor, {
        contactId,
        kind: 'baki',
        amountPoisha: input.amountPoisha,
        occurredAt: this.entryTime(input.occurredAt, now),
        method: null,
        note: input.note ?? null,
        source,
      }),
    );
  }

  // Paying more than is owed is allowed: the balance goes below zero and shows as store credit.
  collectPayment(
    storeId: string,
    contactId: string,
    input: CollectPaymentInput,
    { actor, source = 'manual' }: Recorder,
  ): Promise<RecordedDueEntryResponse> {
    return this.inLockedTransaction(storeId, contactId, async (now) =>
      this.save(storeId, now, actor, {
        contactId,
        kind: 'payment',
        amountPoisha: input.amountPoisha,
        occurredAt: this.entryTime(input.occurredAt, now),
        method: input.method,
        note: input.note ?? null,
        source,
      }),
    );
  }

  async writeOff(
    storeId: string,
    contactId: string,
    input: WriteOffInput,
    { actor, access }: { actor: UserActor; access: StoreAccess },
  ): Promise<RecordedDueEntryResponse> {
    if (!this.team.canWriteOffDue(access)) throw dueBookError('DUE_WRITE_OFF_NOT_ALLOWED');
    return this.inLockedTransaction(storeId, contactId, async (now) => {
      const { balancePoisha } = await this.balances.balanceOf(storeId, contactId);
      if (input.amountPoisha > balancePoisha) throw dueBookError('DUE_WRITE_OFF_EXCEEDS_BALANCE');
      return this.save(storeId, now, actor, {
        contactId,
        kind: 'write_off',
        amountPoisha: input.amountPoisha,
        occurredAt: now,
        method: null,
        note: input.reason,
        source: 'manual',
      });
    });
  }

  // Only a khata import's undo removes entries; the ledger is otherwise never edited.
  removeKhataEntries(storeId: string, entryIds: string[]): Promise<void> {
    return this.entries.deleteByIds(storeId, entryIds);
  }

  contactsWithEntries(storeId: string, contactIds: string[]): Promise<Set<string>> {
    return this.entries.contactsWithEntries(storeId, contactIds);
  }

  async customer(storeId: string, contactId: string, access: Access): Promise<DueCustomerResponse> {
    const contact = await this.contacts.getById(storeId, contactId, access);
    const balance = await this.balances.balanceOf(storeId, contactId);
    return {
      ...toBalanceResponse(contactId, balance),
      name: contact.name,
      phone: contact.phone,
    };
  }

  async history(
    storeId: string,
    contactId: string,
    query: DueHistoryQuery,
    access: Access,
  ): Promise<DueHistoryResponse> {
    await this.contacts.getById(storeId, contactId, access);
    const rows = await this.entries.history(storeId, contactId, {
      cursor: readCursor(query.cursor),
      limit: query.limit + 1,
    });
    const items = rows.slice(0, query.limit).map((row) => ({
      ...toEntryResponse(row),
      balanceAfterPoisha: row.balanceAfterPoisha,
    }));
    const last = items.at(-1);
    return {
      items,
      nextCursor: rows.length > query.limit && last ? writeCursor(last.occurredAt, last.id) : null,
    };
  }

  async listCustomers(
    storeId: string,
    query: DueCustomerListQuery,
    access: Access,
  ): Promise<DueCustomerListResponse> {
    const cursor = readCursor(query.cursor);
    const rows = await this.balances.listOwing(storeId, {
      overdueBefore: this.overdueBefore(),
      filter: query.filter,
      cursor: cursor && { oldestDebtAt: cursor.occurredAt, contactId: cursor.id },
      limit: query.limit + 1,
    });
    const items = rows.slice(0, query.limit).map((row) => ({
      contactId: row.contactId,
      name: row.name,
      phone: row.phone && !access.seeFullPhone ? maskPhone(row.phone) : row.phone,
      balancePoisha: row.balancePoisha,
      oldestDebtAt: row.oldestDebtAt.toISOString(),
      lastRemindedAt: row.lastRemindedAt?.toISOString() ?? null,
    }));
    const last = rows[query.limit - 1];
    return {
      items,
      nextCursor:
        rows.length > query.limit && last
          ? writeCursor(last.oldestDebtAt.toISOString(), last.contactId)
          : null,
    };
  }

  async summary(storeId: string): Promise<DueSummaryResponse> {
    const [totals, collectedLast7DaysPoisha] = await Promise.all([
      this.balances.totals(storeId, this.overdueBefore()),
      this.balances.collectedSince(storeId, new Date(this.clock.now().getTime() - 7 * DAY_MS)),
    ]);
    return { ...totals, collectedLast7DaysPoisha };
  }

  private overdueBefore(): Date {
    return new Date(this.clock.now().getTime() - OVERDUE_DAYS * DAY_MS);
  }

  // The row lock makes two entries for one customer run one after the other.
  private inLockedTransaction(
    storeId: string,
    contactId: string,
    work: (now: Date) => Promise<RecordedDueEntryResponse>,
  ): Promise<RecordedDueEntryResponse> {
    return this.transaction.run(storeId, async () => {
      await this.contacts.lockForDueBook(storeId, contactId);
      return work(this.clock.now());
    });
  }

  private entryTime(occurredAt: string | undefined, now: Date): Date {
    if (!occurredAt) return now;
    const time = new Date(occurredAt);
    if (time > now) throw dueBookError('DUE_ENTRY_IN_FUTURE');
    return time;
  }

  private async save(
    storeId: string,
    now: Date,
    actor: Actor,
    entry: Omit<NewDueEntry, 'recordedByUserId'>,
  ): Promise<RecordedDueEntryResponse> {
    const saved = await this.entries.insert(storeId, {
      ...entry,
      recordedByUserId: actor.kind === 'user' ? actor.userId : null,
    });
    await this.outbox.publish({
      type: EVENT_TYPES[entry.kind],
      storeId,
      occurredAt: now.toISOString(),
      payload: { contactId: entry.contactId, entryId: saved.id },
    });
    const balance = await this.balances.balanceOf(storeId, entry.contactId);
    return { entry: toEntryResponse(saved), balance: toBalanceResponse(entry.contactId, balance) };
  }
}

function toEntryResponse(entry: DueEntry): DueEntryResponse {
  return {
    ...entry,
    occurredAt: entry.occurredAt.toISOString(),
    createdAt: entry.createdAt.toISOString(),
  };
}

function toBalanceResponse(contactId: string, balance: DueBalance): DueBalanceResponse {
  return {
    contactId,
    balancePoisha: balance.balancePoisha,
    oldestDebtAt: balance.oldestDebtAt?.toISOString() ?? null,
  };
}

function writeCursor(time: string, id: string): string {
  return `${time}|${id}`;
}

// The schema has already checked the shape.
function readCursor(cursor: string | undefined): { occurredAt: Date; id: string } | undefined {
  if (!cursor) return undefined;
  const [time, id] = cursor.split('|') as [string, string];
  return { occurredAt: new Date(time), id };
}
