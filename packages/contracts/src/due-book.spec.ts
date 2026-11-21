import { describe, expect, it } from 'vitest';

import {
  collectPaymentSchema,
  dueCustomerListQuerySchema,
  MAX_DUE_AMOUNT_POISHA,
  recordBakiSchema,
  writeOffSchema,
} from './due-book';

describe('due book input', () => {
  it('takes whole poisha above zero and below the cap', () => {
    expect(recordBakiSchema.safeParse({ amountPoisha: 95000 }).success).toBe(true);
    for (const amountPoisha of [0, -5, 10.5, MAX_DUE_AMOUNT_POISHA + 1])
      expect(recordBakiSchema.safeParse({ amountPoisha }).success).toBe(false);
  });

  it('needs a payment method from the list', () => {
    expect(collectPaymentSchema.safeParse({ amountPoisha: 100 }).success).toBe(false);
    expect(collectPaymentSchema.safeParse({ amountPoisha: 100, method: 'cheque' }).success).toBe(
      false,
    );
    expect(collectPaymentSchema.safeParse({ amountPoisha: 100, method: 'bkash' }).success).toBe(
      true,
    );
  });

  it('needs a reason to write off', () => {
    expect(writeOffSchema.safeParse({ amountPoisha: 100 }).success).toBe(false);
    expect(writeOffSchema.safeParse({ amountPoisha: 100, reason: '   ' }).success).toBe(false);
    expect(writeOffSchema.safeParse({ amountPoisha: 100, reason: 'Moved away' }).success).toBe(
      true,
    );
  });

  it('refuses a store id or other unknown field', () => {
    expect(recordBakiSchema.safeParse({ amountPoisha: 100, storeId: 'x' }).success).toBe(false);
  });

  it('defaults the list and rejects a cursor that is not ours', () => {
    expect(dueCustomerListQuerySchema.parse({})).toEqual({ filter: 'all', limit: 50 });
    expect(dueCustomerListQuerySchema.safeParse({ cursor: "1'; drop table" }).success).toBe(false);
    expect(
      dueCustomerListQuerySchema.safeParse({
        cursor: '2026-11-01T00:00:00.000Z|0198a3b4-0000-7000-8000-000000000001',
      }).success,
    ).toBe(true);
  });
});
