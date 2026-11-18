import { expect, it } from 'vitest';

import { partialOrderTotals } from './order-totals';

it('allocates the order discount by delivered value across different prices', () => {
  expect(
    partialOrderTotals(
      {
        itemsSubtotalPoisha: 5000,
        orderDiscountPoisha: 500,
        deliveryChargePoisha: 600,
        advancePaidPoisha: 200,
      },
      [
        {
          item: { id: 'shirt', quantity: 1, unitPricePoisha: 1000, lineDiscountPoisha: 0 },
          quantity: 1,
        },
        {
          item: { id: 'panjabi', quantity: 1, unitPricePoisha: 4000, lineDiscountPoisha: 0 },
          quantity: 0,
        },
      ],
    ).amounts,
  ).toEqual({
    deliveredItemsSubtotalPoisha: 1000,
    deliveredOrderDiscountPoisha: 100,
    codAmountPoisha: 1300,
  });
});
