import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContactsRepository } from './contacts.repository';
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

  it('creates a contact in the given store', async () => {
    repository.insert.mockResolvedValue(contact);

    const result = await service.create(
      STORE_ID,
      { name: 'Rahim', phone: '01712345678' },
      { seeFullPhone: true },
    );

    expect(result).toEqual({ ...contact, createdAt: '2026-11-12T10:00:00.000Z' });
    expect(repository.insert).toHaveBeenCalledWith(STORE_ID, {
      name: 'Rahim',
      phone: '01712345678',
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
});
