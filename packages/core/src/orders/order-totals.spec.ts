import { expect, it } from 'vitest';

import { orderTotals, partialOrderTotals } from './order-totals';

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

it('rejects a total above the largest exact poisha amount even after recording an advance', () => {
  expect(() =>
    orderTotals(
      [
        {
          variantId: 'shirt',
          productName: 'Shirt',
          variantTitle: 'M',
          quantity: 1,
          unitPricePoisha: Number.MAX_SAFE_INTEGER,
          isStockTracked: false,
        },
      ],
      { orderDiscountPoisha: 0, deliveryChargePoisha: 2, advancePaidPoisha: 4 },
    ),
  ).toThrow(expect.objectContaining({ code: 'ORDER_TOTAL_INVALID' }));
});
