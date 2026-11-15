import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomersRepository } from './customers.repository';
import { CustomersService } from './customers.service';

const STORE_ID = '7f1d3a52-4c55-4a8e-9a43-2a1f0c7d9b10';

const customer = {
  id: 'c5a0f0e4-0b55-4b7e-8d0e-6f3c3b7f1e21',
  name: 'Rahim',
  phone: '01712345678',
  createdAt: new Date('2026-11-12T10:00:00Z'),
};

describe('CustomersService', () => {
  const repository = { insert: vi.fn(), findById: vi.fn() };
  let service: CustomersService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new CustomersService(repository as unknown as CustomersRepository);
  });

  it('creates a customer in the given store', async () => {
    repository.insert.mockResolvedValue(customer);

    const result = await service.create(
      STORE_ID,
      { name: 'Rahim', phone: '01712345678' },
      { seeFullPhone: true },
    );

    expect(result).toEqual({ ...customer, createdAt: '2026-11-12T10:00:00.000Z' });
    expect(repository.insert).toHaveBeenCalledWith(STORE_ID, {
      name: 'Rahim',
      phone: '01712345678',
    });
  });

  it('masks phone numbers on both reads and creation without the flag', async () => {
    repository.insert.mockResolvedValue(customer);
    repository.findById.mockResolvedValue(customer);
    expect(
      (
        await service.create(
          STORE_ID,
          { name: 'Rahim', phone: customer.phone },
          { seeFullPhone: false },
        )
      ).phone,
    ).toBe('017XXXXX678');
    expect((await service.getById(STORE_ID, customer.id, { seeFullPhone: false })).phone).toBe(
      '017XXXXX678',
    );
  });

  it('rejects a phone number the store already has', async () => {
    repository.insert.mockResolvedValue(undefined);

    await expect(
      service.create(STORE_ID, { name: 'Rahim', phone: '01712345678' }, { seeFullPhone: true }),
    ).rejects.toMatchObject({ code: 'CUSTOMER_PHONE_TAKEN', status: 409 });
  });

  it('returns 404 for a customer that is not in this store', async () => {
    repository.findById.mockResolvedValue(undefined);

    await expect(
      service.getById(STORE_ID, customer.id, { seeFullPhone: true }),
    ).rejects.toMatchObject({
      code: 'CUSTOMER_NOT_FOUND',
      status: 404,
    });
  });
});
