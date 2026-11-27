import { useId } from 'react';
import { useController, useFormContext, useWatch } from 'react-hook-form';

import { formatMoney } from '@dakly/contracts/money';
import {
  productNegotiationIssues,
  takaInput,
  type ProductFormValues,
} from '@dakly/contracts/products';
import { Checkbox } from '@dakly/ui/checkbox';
import { Label } from '@dakly/ui/label';

import { ProductMoneyField } from './product-money-field';

export function ProductNegotiationFields() {
  const { resetField } = useFormContext<ProductFormValues>();
  const checkboxId = useId();
  const { field } = useController<ProductFormValues, 'negotiationEnabled'>({
    name: 'negotiationEnabled',
  });
  const [variants, floor] = useWatch<ProductFormValues, ['variants', 'negotiationFloorPoisha']>({
    name: ['variants', 'negotiationFloorPoisha'],
  });
  const disabled =
    !field.value && variants?.some((variant) => Boolean(variant.priceOverridePoisha));
  const belowCost = floorIsBelowCost(floor, variants);
  const changeEnabled = (enabled: boolean) => {
    field.onChange(enabled);
    if (enabled) return;
    resetField('negotiationOpeningPoisha');
    resetField('negotiationFloorPoisha');
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Checkbox
          id={checkboxId}
          checked={field.value}
          disabled={disabled}
          aria-describedby={disabled ? `${checkboxId}-hint` : undefined}
          onCheckedChange={(checked) => changeEnabled(checked === true)}
        />
        <Label htmlFor={checkboxId} className="cursor-pointer text-base font-semibold text-text">
          Eligible AI negotiation
        </Label>
      </div>
      {disabled ? (
        <p id={`${checkboxId}-hint`} className="text-sm text-text-muted">
          {productNegotiationIssues.PRODUCT_NEGOTIATION_VARIANT_PRICE.message}
        </p>
      ) : null}
      {field.value ? <NegotiationPrices belowCost={belowCost} /> : null}
    </div>
  );
}

function NegotiationPrices({ belowCost }: { belowCost: boolean | undefined }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <ProductMoneyField
        name="negotiationFloorPoisha"
        label="Min price"
        hint="The AI never goes below this. Customers never see it."
      />
      <ProductMoneyField
        name="negotiationOpeningPoisha"
        label="Opening offer price"
        hint="The AI offers this first when a customer asks for a lower price."
        deps="negotiationFloorPoisha"
      />
      <NegotiationSummary />
      {belowCost ? (
        <p className="text-sm text-warning sm:col-span-2" role="status">
          The lowest price is below the product cost.
        </p>
      ) : null}
    </div>
  );
}

// What the AI will do with the two prices, in the words a customer would hear.
function NegotiationSummary() {
  const [opening, floor] = useWatch<
    ProductFormValues,
    ['negotiationOpeningPoisha', 'negotiationFloorPoisha']
  >({ name: ['negotiationOpeningPoisha', 'negotiationFloorPoisha'] });
  const first = takaInput.safeParse(opening);
  const lowest = takaInput.safeParse(floor);
  if (!first.success || !lowest.success || lowest.data > first.data) return null;
  return (
    <p role="status" className="text-sm text-text sm:col-span-2">
      Opens at <span className="font-medium">{formatMoney(first.data)}</span>, never goes below{' '}
      <span className="font-medium">{formatMoney(lowest.data)}</span>.
    </p>
  );
}

function floorIsBelowCost(
  floor: ProductFormValues['negotiationFloorPoisha'],
  variants: ProductFormValues['variants'],
) {
  const amount = takaInput.safeParse(floor);
  return (
    amount.success &&
    variants?.some(({ costPoisha }) => {
      const cost = takaInput.safeParse(costPoisha);
      return cost.success && amount.data < cost.data;
    })
  );
}
