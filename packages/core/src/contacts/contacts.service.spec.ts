import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Clock } from '../platform/clock';
import type { StoreTransaction } from '../platform/database/store-transaction';
import type { OutboxService } from '../platform/outbox/outbox.service';
import type { ContactIdentitiesRepository } from './contact-identities.repository';
import type { Contact, ContactFilter, ContactsRepository, NewContact } from './contacts.repository';
import { ContactsService } from './contacts.service';
import type { ImportContactsRepository } from './import-contacts.repository';
import type { OrderContactsRepository } from './order-contacts.repository';

const STORE_ID = '7f1d3a52-4c55-4a8e-9a43-2a1f0c7d9b10';
const actor = { kind: 'user', userId: '0b8f3c1e-5d2a-4f6b-9c7e-1a2b3c4d5e6f' } as const;

const contact = {
  id: 'c5a0f0e4-0b55-4b7e-8d0e-6f3c3b7f1e21',
  name: 'Rahim',
  phone: '01712345678',
  kind: 'customer' as const,
  tags: [],
  createdAt: new Date('2026-11-12T10:00:00Z'),
};

describe('ContactsService', () => {
  const repository = {
    insert: vi.fn(),
    findById: vi.fn(),
    list: vi.fn(),
    findIdentities: vi.fn(),
    update: vi.fn(),
    softDeleteAll: vi.fn(),
    lockForConsent: vi.fn(),
  };
  const transaction = { run: (_storeId: string, work: () => Promise<unknown>) => work() };
  let service: ContactsService;

  beforeEach(() => {
    vi.resetAllMocks();
    repository.findIdentities.mockResolvedValue([]);
    service = new ContactsService(
      repository as unknown as ContactsRepository,
      {} as ContactIdentitiesRepository,
      transaction as unknown as StoreTransaction,
      { publish: vi.fn(), publishAll: vi.fn() } as unknown as OutboxService,
      { now: () => new Date('2026-11-16T04:30:00Z') } as Clock,
      {
        findByPhones: vi.fn(),
        insertImported: vi.fn(),
        updateImported: vi.fn(),
      } as unknown as ImportContactsRepository,
      {} as OrderContactsRepository,
    );
  });

  it('creates a staff add as a customer in the given store', async () => {
    const saved = new Map<string, NewContact & { storeId: string }>();
    repository.insert.mockImplementation(async (storeId: string, input: NewContact) => {
      saved.set(contact.id, { ...input, storeId });
      return {
        id: contact.id,
        name: input.name,
        phone: input.phone,
        kind: input.kind,
        tags: [],
        createdAt: contact.createdAt,
      };
    });
    repository.findById.mockImplementation(async (storeId: string, id: string) => {
      const row = saved.get(id);
      return row?.storeId === storeId
        ? { ...contact, name: row.name, phone: row.phone, kind: row.kind }
        : undefined;
    });

    const result = await service.create(
      STORE_ID,
      { name: 'Rahim', phone: '01712345678' },
      { seeFullPhone: true },
      actor,
    );

    expect(result).toEqual({ ...contact, createdAt: '2026-11-12T10:00:00.000Z' });
    expect(saved.get(contact.id)).toEqual({
      storeId: STORE_ID,
      name: 'Rahim',
      phone: '01712345678',
      source: 'manual',
      kind: 'customer',
    });
    expect(await service.getById(STORE_ID, contact.id, { seeFullPhone: true })).toEqual({
      ...result,
      identities: [],
    });
  });

  it('masks phone numbers on both reads and creation without the flag', async () => {
    repository.insert.mockResolvedValue(contact);
    repository.findById.mockResolvedValue(contact);
    expect(
      (
        await service.create(
          STORE_ID,
          { name: 'Rahim', phone: contact.phone },
          { seeFullPhone: false },
          actor,
        )
      ).phone,
    ).toBe('01712-XXX678');
    expect((await service.getById(STORE_ID, contact.id, { seeFullPhone: false })).phone).toBe(
      '01712-XXX678',
    );
  });

  it('returns no phone for a chat contact that has none, with or without the flag', async () => {
    repository.findById.mockResolvedValue({
      ...contact,
      name: null,
      phone: null,
      kind: 'chat_only',
    });

    for (const seeFullPhone of [true, false])
      expect((await service.getById(STORE_ID, contact.id, { seeFullPhone })).phone).toBeNull();
  });

  it('rejects a phone number the store already has', async () => {
    repository.insert.mockResolvedValue(undefined);

    await expect(
      service.create(
        STORE_ID,
        { name: 'Rahim', phone: '01712345678' },
        { seeFullPhone: true },
        actor,
      ),
    ).rejects.toMatchObject({ code: 'CONTACT_PHONE_TAKEN', status: 409 });
  });

  it('returns 404 for a contact that is not in this store', async () => {
    repository.findById.mockResolvedValue(undefined);

    await expect(
      service.getById(STORE_ID, contact.id, { seeFullPhone: true }),
    ).rejects.toMatchObject({
      code: 'CONTACT_NOT_FOUND',
      status: 404,
    });
  });

  it('rejects an edit to a phone number another contact has', async () => {
    repository.update.mockResolvedValue('phone_taken');

    await expect(
      service.editDetails(
        STORE_ID,
        contact.id,
        { phone: '01812345678' },
        { access: { seeFullPhone: true }, actor },
      ),
    ).rejects.toMatchObject({ code: 'CONTACT_PHONE_TAKEN', status: 409 });
  });

  it('returns the edited contact masked without the flag', async () => {
    repository.update.mockResolvedValue({ ...contact, tags: ['ঈদ'] });

    expect(
      await service.editDetails(
        STORE_ID,
        contact.id,
        { tags: ['ঈদ'] },
        { access: { seeFullPhone: false }, actor },
      ),
    ).toMatchObject({ phone: '01712-XXX678', tags: ['ঈদ'] });
  });

  it('returns 404 when editing or deleting a contact that is not in this store', async () => {
    repository.update.mockResolvedValue(undefined);
    repository.softDeleteAll.mockResolvedValue([]);

    await expect(
      service.editDetails(
        STORE_ID,
        contact.id,
        { name: 'রহিম' },
        { access: { seeFullPhone: true }, actor },
      ),
    ).rejects.toMatchObject({ code: 'CONTACT_NOT_FOUND', status: 404 });
    await expect(service.remove(STORE_ID, contact.id, actor)).rejects.toMatchObject({
      code: 'CONTACT_NOT_FOUND',
      status: 404,
    });
  });

  describe('list', () => {
    const people: Contact[] = [
      { ...contact, id: '019c01ea-cf15-7d31-a7f5-d73d66007a01', name: 'রিনা বেগম' },
      {
        ...contact,
        id: '019c01ea-cf15-7d31-a7f5-d73d66007a02',
        name: 'Karim',
        phone: '01812345678',
      },
      { ...contact, id: '019c01ea-cf15-7d31-a7f5-d73d66007a03', name: 'Sumi', phone: null },
    ];
    // Behaves like the repository's filters over a store's contacts, newest first.
    const fakeList = async (_storeId: string, filter: ContactFilter) => {
      const start = filter.cursor ? people.findIndex((row) => row.id === filter.cursor) + 1 : 0;
      return people
        .slice(start)
        .filter(
          (row) =>
            (!filter.phone || row.phone === filter.phone) &&
            (!filter.phonePrefix || row.phone?.startsWith(filter.phonePrefix)) &&
            (!filter.name || row.name?.includes(filter.name)),
        )
        .slice(0, filter.limit + 1);
    };
    const search = async (term: string, seeFullPhone: boolean) =>
      (await service.list(STORE_ID, { limit: 50, search: term }, { seeFullPhone })).items.map(
        (item) => [item.name, item.phone],
      );

    beforeEach(() => {
      repository.list.mockImplementation(fakeList);
    });

    it('finds a contact by its full number in any form, masked without the flag', async () => {
      expect(await search('+880 ১৮১২-৩৪৫৬৭৮', false)).toEqual([['Karim', '01812-XXX678']]);
      expect(await search('01812345678', true)).toEqual([['Karim', '01812345678']]);
    });

    it('finds by part of a number only for members who see full phones', async () => {
      expect(await search('01812', false)).toEqual([]);
      expect(await search('01812', true)).toEqual([['Karim', '01812345678']]);
    });

    it('finds by name for every member', async () => {
      expect(await search('রিনা', false)).toEqual([['রিনা বেগম', '01712-XXX678']]);
    });

    it('rejects a name search shorter than 3 characters but not a short number', async () => {
      await expect(search('রি', true)).rejects.toMatchObject({
        code: 'CONTACT_SEARCH_TOO_SHORT',
        status: 400,
      });
      expect(await search('01', false)).toEqual([]);
    });

    it('returns a cursor only while more contacts follow', async () => {
      const first = await service.list(STORE_ID, { limit: 2 }, { seeFullPhone: true });
      expect(first.items.map((item) => item.id)).toEqual([people[0]!.id, people[1]!.id]);
      expect(first.nextCursor).toBe(people[1]!.id);

      const second = await service.list(
        STORE_ID,
        { limit: 2, cursor: first.nextCursor! },
        { seeFullPhone: true },
      );
      expect(second.items.map((item) => item.id)).toEqual([people[2]!.id]);
      expect(second.nextCursor).toBeNull();
    });
  });

  it('locks a contact for consent only when this store has it', async () => {
    repository.lockForConsent.mockImplementation(async (storeId: string, ids: string[]) =>
      storeId === STORE_ID ? ids : [],
    );

    await expect(service.lockForConsent(STORE_ID, [contact.id])).resolves.toBeUndefined();
    await expect(
      service.lockForConsent('0b7e5f6a-2d4c-4f1e-9a3b-8c6d5e4f3a21', [contact.id]),
    ).rejects.toMatchObject({ code: 'CONTACT_NOT_FOUND', status: 404 });
  });
});
