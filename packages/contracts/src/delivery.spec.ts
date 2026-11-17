import { describe, expect, it } from 'vitest';

import {
  areaListQuerySchema,
  changeDeliveryZoneSchema,
  createDeliveryZoneSchema,
} from './delivery';

describe('delivery zone contracts', () => {
  it('accepts integer poisha and keeps omitted edits absent', () => {
    expect(
      createDeliveryZoneSchema.parse({
        name: ' Outside Dhaka ',
        chargePoisha: 12000,
        isDefault: true,
      }),
    ).toMatchObject({ name: 'Outside Dhaka', chargePoisha: 12000, bdAreaIds: [] });
    expect(changeDeliveryZoneSchema.parse({ chargePoisha: 10000 })).toEqual({
      chargePoisha: 10000,
    });
  });
  it.each([
    { chargePoisha: -1 },
    { chargePoisha: 60.5 },
    { chargePoisha: Number.MAX_SAFE_INTEGER + 1 },
    { bdAreaIds: [1, 1] },
    { bdAreaIds: [-1] },
    { bdAreaIds: [2147483648] },
    { storeId: 'untrusted' },
  ])('rejects invalid charges and areas: %j', (input) => {
    expect(
      createDeliveryZoneSchema.safeParse({ name: 'Dhaka', chargePoisha: 6000, ...input }).success,
    ).toBe(false);
  });
  it('requires an edit and bounds area pagination', () => {
    expect(changeDeliveryZoneSchema.safeParse({}).success).toBe(false);
    expect(areaListQuerySchema.parse({ parentId: '1' })).toEqual({ parentId: 1, limit: 50 });
    expect(areaListQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(areaListQuerySchema.safeParse({ parentId: 2147483648 }).success).toBe(false);
  });
});
