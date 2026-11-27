export type DraftLinePrice = { quantity: number; unitPricePoisha: number };

export type NewOrderTotals = {
  subtotalPoisha: number;
  totalPoisha: number;
  cashToCollectPoisha: number;
  // A discount above the items cannot be saved, so the summary names it instead of a negative total.
  discountTooLarge: boolean;
};

// A preview only: the server prices every line again from the catalogue when the order is saved.
export function newOrderTotals(input: {
  lines: DraftLinePrice[];
  discountPoisha: number;
  deliveryPoisha: number;
  advancePoisha: number;
}): NewOrderTotals {
  const subtotalPoisha = input.lines.reduce(
    (sum, { quantity, unitPricePoisha }) => sum + quantity * unitPricePoisha,
    0,
  );
  const discountTooLarge = input.discountPoisha > subtotalPoisha;
  const totalPoisha = discountTooLarge
    ? subtotalPoisha + input.deliveryPoisha
    : subtotalPoisha - input.discountPoisha + input.deliveryPoisha;
  return {
    subtotalPoisha,
    totalPoisha,
    cashToCollectPoisha: Math.max(0, totalPoisha - input.advancePoisha),
    discountTooLarge,
  };
}
