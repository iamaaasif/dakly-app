import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContactsRepository, NewContact } from './contacts.repository';
import { ContactsService } from './contacts.service';

const STORE_ID = '7f1d3a52-4c55-4a8e-9a43-2a1f0c7d9b10';

const contact = {
  id: 'c5a0f0e4-0b55-4b7e-8d0e-6f3c3b7f1e21',
  name: 'Rahim',
  phone: '01712345678',
  kind: 'customer' as const,
  createdAt: new Date('2026-11-12T10:00:00Z'),
};

describe('ContactsService', () => {
  const repository = { insert: vi.fn(), findById: vi.fn() };
  let service: ContactsService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new ContactsService(repository as unknown as ContactsRepository);
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
    );

    expect(result).toEqual({ ...contact, createdAt: '2026-11-12T10:00:00.000Z' });
    expect(saved.get(contact.id)).toEqual({
      storeId: STORE_ID,
      name: 'Rahim',
      phone: '01712345678',
      source: 'manual',
      kind: 'customer',
    });
    expect(await service.getById(STORE_ID, contact.id, { seeFullPhone: true })).toEqual(result);
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
      service.create(STORE_ID, { name: 'Rahim', phone: '01712345678' }, { seeFullPhone: true }),
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

  it('confirms a contact exists only when this store has it', async () => {
    repository.findById.mockImplementation(async (storeId: string) =>
      storeId === STORE_ID ? contact : undefined,
    );

    await expect(service.assertContactExists(STORE_ID, contact.id)).resolves.toBeUndefined();
    await expect(
      service.assertContactExists('0b7e5f6a-2d4c-4f1e-9a3b-8c6d5e4f3a21', contact.id),
    ).rejects.toMatchObject({ code: 'CONTACT_NOT_FOUND', status: 404 });
  });
});
