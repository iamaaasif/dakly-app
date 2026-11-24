import { describe, expect, it } from 'vitest';

import type { StoreTransaction } from '../platform/database/store-transaction';
import type { DeliveryRepository } from './delivery.repository';
import { DeliveryService } from './delivery.service';

const areas = [
  { id: 301, kind: 'district', name: 'Dhaka', nameBn: 'ঢাকা', parentId: 3 },
  { id: 30260072, kind: 'upazila', name: 'Savar', nameBn: 'সাভার', parentId: 301 },
];

function serviceWithAreas() {
  const repository = {
    findAreasByName: (_storeId: string, name: string) =>
      Promise.resolve(
        areas.filter((area) => area.name.toLowerCase().startsWith(name.toLowerCase())),
      ),
  } as unknown as DeliveryRepository;
  return new DeliveryService(repository, {} as StoreTransaction, { now: () => new Date() });
}

describe('findAreaIdByName', () => {
  it('finds a place written on its own', async () => {
    await expect(serviceWithAreas().findAreaIdByName('store', 'Savar')).resolves.toBe(30260072);
  });

  it('falls back to the district when the neighbourhood is not an area', async () => {
    await expect(serviceWithAreas().findAreaIdByName('store', 'Dhanmondi, Dhaka')).resolves.toBe(
      301,
    );
  });

  it('prefers the more specific part when it matches', async () => {
    await expect(serviceWithAreas().findAreaIdByName('store', 'Savar, Dhaka')).resolves.toBe(
      30260072,
    );
  });

  it('refuses a place no part of which is an area', async () => {
    await expect(
      serviceWithAreas().findAreaIdByName('store', 'Narnia, Mars'),
    ).rejects.toMatchObject({ code: 'DELIVERY_AREA_INVALID' });
  });
});
