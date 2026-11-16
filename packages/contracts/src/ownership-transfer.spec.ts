import { describe, expect, it } from 'vitest';

import {
  ownershipTransferCodeSchema,
  startOwnershipTransferSchema,
  acceptOwnershipTransferSchema,
  ownershipTransferResponseSchema,
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

  it('names the recipient with a masked phone and never a raw phone or email', () => {
    const transfer = {
      id: membershipId,
      ownerUserId: membershipId,
      newOwnerUserId: membershipId,
      recipientName: 'Rina',
      recipientContact: '01712-XXX678',
      expiresAt: '2026-11-18T10:00:00.000Z',
      status: 'pending',
    };
    expect(ownershipTransferResponseSchema.parse(transfer)).toEqual(transfer);
    expect(
      ownershipTransferResponseSchema.safeParse({ ...transfer, recipientContact: null }).success,
    ).toBe(true);
    for (const recipientContact of ['01712345678', 'rina@example.com', '01712-345678'])
      expect(
        ownershipTransferResponseSchema.safeParse({ ...transfer, recipientContact }).success,
      ).toBe(false);
    expect(
      ownershipTransferResponseSchema.safeParse({ ...transfer, recipientPhone: '01712345678' })
        .success,
    ).toBe(false);
    expect(
      ownershipTransferResponseSchema.safeParse({ ...transfer, recipientName: undefined }).success,
    ).toBe(false);
  });
});
