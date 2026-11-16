import { randomUUID } from 'node:crypto';

import { beforeEach, describe, expect, it } from 'vitest';

import type { SegmentRules } from '@dakly/contracts/segments';

import type { ContactsService } from '../contacts/contacts.service';
import type { Clock } from '../platform/clock';
import type { StoreTransaction } from '../platform/database/store-transaction';
import type { OutboxService } from '../platform/outbox/outbox.service';
import type { Segment, SegmentsRepository } from './segments.repository';
import { SegmentsService } from './segments.service';

const STORE_ID = '7f1d3a52-4c55-4a8e-9a43-2a1f0c7d9b10';
const staff = { kind: 'user', userId: 'c5a0f0e4-0b55-4b7e-8d0e-6f3c3b7f1e21' } as const;
const now = new Date('2026-11-16T05:00:00Z');
const vip: SegmentRules = {
  match: 'all',
  conditions: [{ field: 'tag', operator: 'is_any_of', values: ['vip'] }],
};

// Keeps one store's segments in memory and refuses a duplicate name as the unique index does.
class FakeSegmentsRepository {
  readonly rows = new Map<string, Segment>();

  async countSaved() {
    return this.rows.size;
  }

  async findIdByName(_storeId: string, name: string) {
    return [...this.rows.values()].find((row) => row.name === name)?.id;
  }

  async find(_storeId: string, id: string) {
    return this.rows.get(id);
  }

  async insert(_storeId: string, input: Pick<Segment, 'name' | 'rules'>) {
    const row = { id: randomUUID(), ...input, createdAt: now, updatedAt: now };
    this.rows.set(row.id, row);
    return row;
  }

  async change(_storeId: string, id: string, change: Partial<Segment>) {
    const row = this.rows.get(id);
    if (!row) return undefined;
    if (change.name && change.name !== row.name && (await this.findIdByName(STORE_ID, change.name)))
      return 'name_taken' as const;
    const changed = { ...row, ...change };
    this.rows.set(id, changed);
    return changed;
  }

  async remove(_storeId: string, id: string) {
    return this.rows.delete(id);
  }
}

describe('SegmentsService', () => {
  let repository: FakeSegmentsRepository;
  let service: SegmentsService;

  beforeEach(() => {
    repository = new FakeSegmentsRepository();
    const transaction = {
      run: (_: string, work: () => unknown) => work(),
      runLocked: (_: string, work: () => unknown) => work(),
    };
    const contacts = { countMatching: async () => 7 };
    service = new SegmentsService(
      repository as unknown as SegmentsRepository,
      contacts as unknown as ContactsService,
      transaction as unknown as StoreTransaction,
      { publish: async () => undefined } as unknown as OutboxService,
      { now: () => now } as Clock,
    );
  });

  it('refuses the 201st segment', async () => {
    for (let index = 0; index < 200; index += 1)
      await service.create(STORE_ID, { name: `ভাগ ${index}`, rules: vip }, staff);

    await expect(
      service.create(STORE_ID, { name: 'আরও একটি', rules: vip }, staff),
    ).rejects.toMatchObject({ code: 'SEGMENT_LIMIT_REACHED', status: 409 });
  });

  it('refuses a name another segment has, on create and on rename', async () => {
    await service.create(STORE_ID, { name: 'ভিআইপি', rules: vip }, staff);
    const other = await service.create(STORE_ID, { name: 'নতুন ক্রেতা', rules: vip }, staff);

    await expect(
      service.create(STORE_ID, { name: 'ভিআইপি', rules: vip }, staff),
    ).rejects.toMatchObject({ code: 'SEGMENT_NAME_TAKEN', status: 409 });
    await expect(
      service.change(STORE_ID, other.id, { name: 'ভিআইপি' }, staff),
    ).rejects.toMatchObject({ code: 'SEGMENT_NAME_TAKEN', status: 409 });
  });

  it('lets a segment keep its own name while its rules change', async () => {
    const segment = await service.create(STORE_ID, { name: 'ভিআইপি', rules: vip }, staff);
    const dhaka: SegmentRules = {
      match: 'any',
      conditions: [{ field: 'district', operator: 'is_any_of', values: ['ঢাকা'] }],
    };

    expect(
      await service.change(STORE_ID, segment.id, { name: 'ভিআইপি', rules: dhaka }, staff),
    ).toMatchObject({ id: segment.id, name: 'ভিআইপি', rules: dhaka });
  });

  it('answers SEGMENT_NOT_FOUND for a segment that does not exist', async () => {
    const missing = randomUUID();
    const notFound = { code: 'SEGMENT_NOT_FOUND', status: 404 };

    await expect(service.change(STORE_ID, missing, { name: 'নাম' }, staff)).rejects.toMatchObject(
      notFound,
    );
    await expect(service.remove(STORE_ID, missing, staff)).rejects.toMatchObject(notFound);
    await expect(service.contactIds(STORE_ID, missing, { limit: 10 })).rejects.toMatchObject(
      notFound,
    );
  });

  it('counts through the contacts service', async () => {
    expect(await service.count(STORE_ID, vip)).toEqual({ count: 7 });
  });
});
