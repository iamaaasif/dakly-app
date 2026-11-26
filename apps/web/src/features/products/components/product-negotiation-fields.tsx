import { useController, useFormContext, useWatch } from 'react-hook-form';

import {
  productNegotiationIssues,
  takaInput,
  type ProductFormValues,
} from '@dakly/contracts/products';
import { FormField } from '@dakly/ui/form-field';
import { Switch } from '@dakly/ui/switch';

import { ProductInputField } from './product-input-field';

export function ProductNegotiationFields() {
  const { resetField } = useFormContext<ProductFormValues>();
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
    if (!enabled) {
      resetField('negotiationOpeningPoisha');
      resetField('negotiationFloorPoisha');
    }
  };
  return (
    <div className="space-y-3 border-t border-border pt-3">
      <FormField
        name={field.name}
        label="Let the AI negotiate"
        hint={
          disabled ? productNegotiationIssues.PRODUCT_NEGOTIATION_VARIANT_PRICE.message : undefined
        }
      >
        {(control) => (
          <Switch
            {...control}
            checked={field.value}
            disabled={disabled}
            onCheckedChange={changeEnabled}
          />
        )}
      </FormField>
      {field.value ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <ProductInputField
            name="negotiationOpeningPoisha"
            label="Opening offer ৳"
            hint="The AI offers this first when a customer asks for a lower price"
            deps="negotiationFloorPoisha"
          />
          <ProductInputField
            name="negotiationFloorPoisha"
            label="Lowest price ৳"
            hint="The AI never goes below this. Customers never see it."
          />
          {belowCost ? (
            <p className="text-sm text-warning sm:col-span-2" role="status">
              The lowest price is below the product cost.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
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
