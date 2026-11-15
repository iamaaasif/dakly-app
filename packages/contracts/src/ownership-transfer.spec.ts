import { describe, expect, it } from 'vitest';
import {
  ownershipTransferCodeSchema,
  startOwnershipTransferSchema,
  acceptOwnershipTransferSchema,
} from './team';
const membershipId = '019c01ea-cf15-7d31-a7f5-d73d66007ad7';
describe('ownership transfer contracts', () => {
  it('accepts only a membership and a six-digit proof', () => {
    expect(ownershipTransferCodeSchema.parse({ membershipId })).toEqual({ membershipId });
    expect(startOwnershipTransferSchema.parse({ membershipId, code: '012345' }).code).toBe(
      '012345',
    );
    expect(acceptOwnershipTransferSchema.parse({ transferId: membershipId })).toEqual({
      transferId: membershipId,
    });
    for (const input of [
      { membershipId, code: '12345' },
      { membershipId: 'other', code: '123456' },
      { membershipId, code: '123456', storeId: membershipId },
    ]) {
      expect(startOwnershipTransferSchema.safeParse(input).success).toBe(false);
    }
    expect(
      ownershipTransferCodeSchema.safeParse({ membershipId, userId: membershipId }).success,
    ).toBe(false);
    expect(
      acceptOwnershipTransferSchema.safeParse({ transferId: membershipId, storeId: membershipId })
        .success,
    ).toBe(false);
  });
});
