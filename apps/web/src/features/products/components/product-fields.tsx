import { useState } from 'react';
import { Controller, useController, useFormContext } from 'react-hook-form';

import type { ProductFormValues } from '@dakly/contracts/products';
import { Checkbox } from '@dakly/ui/checkbox';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dakly/ui/select';

import { profitPercent } from '../product-variant-grid';
import { ProductDescriptionField } from './product-description-field';
import { ProductInputField } from './product-input-field';
import { ProductLinesField } from './product-lines-field';
import { ProductBrandField, ProductCategoryField } from './product-list-fields';
import { ProductTrackStock } from './product-track-stock';

const extraFlags = [
  ['isVisibleInChats', 'Show in chat replies'],
  ['isVisibleInOrderLink', 'Show in the order link'],
] as const;
type ProductFieldsProps = { productId?: string; onPage?: boolean };

// The modal shows every field in one flow; the full page puts the same parts in titled cards.
export function ProductFields({ productId }: ProductFieldsProps) {
  return (
    <>
      <ProductNameFields productId={productId} />
      <ProductPriceFields productId={productId} />
      <ProductDescriptionFields productId={productId} />
      <ProductStockFields productId={productId} />
    </>
  );
}

function useShowSkuAndCost(productId?: string) {
  const form = useFormContext<ProductFormValues>();
  const simple = !form.watch('options')?.length && form.watch('variants')?.length === 1;
  return { simple, showSkuAndCost: !productId || simple };
}

export function ProductNameFields({ productId, onPage }: ProductFieldsProps) {
  const { showSkuAndCost } = useShowSkuAndCost(productId);
  return (
    <>
      <ProductInputField
        name="name"
        label={onPage ? 'Product name' : 'Name'}
        placeholder="e.g. Cotton Panjabi"
        autoFocus={!productId}
      />
      {onPage ? null : (
        <div className="grid gap-3 md:grid-cols-2">
          <ProductCategoryField />
          <ProductBrandField />
          {showSkuAndCost ? (
            <ProductInputField
              name="variants.0.sku"
              label="Product code"
              placeholder="e.g. UT-PJ-01"
              optional
            />
          ) : null}
        </div>
      )}
    </>
  );
}

export function ProductPriceFields({ productId, onPage }: ProductFieldsProps) {
  const { simple, showSkuAndCost } = useShowSkuAndCost(productId);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <ProductInputField
          name="pricePoisha"
          label={onPage ? 'Regular price ৳' : 'Selling price ৳'}
          deps={onPage ? 'compareAtPricePoisha' : undefined}
        />
        <ProductInputField
          name="compareAtPricePoisha"
          label={onPage ? 'Sell price ৳' : 'Old price ৳'}
          optional
        />
        {showSkuAndCost ? (
          <ProductInputField
            name="variants.0.costPoisha"
            label={onPage ? 'Product cost ৳' : 'Your cost ৳'}
            optional
          />
        ) : null}
      </div>
      {simple ? <PlainProfit onPage={onPage} /> : null}
      {simple ? <DefaultOverride /> : null}
    </>
  );
}

type WeightUnit = 'g' | 'kg';

export function ProductDeliveryFields() {
  const { control, setError, clearErrors } = useFormContext<ProductFormValues>();
  const { field, fieldState } = useController({ control, name: 'weightGrams' });
  const [unit, setUnit] = useState<WeightUnit>('g');
  const [amount, setAmount] = useState(field.value ?? '');
  const changeAmount = (value: string) => {
    setAmount(value);
    if (unit === 'kg' && value !== '' && !/^\d+(?:\.\d{1,3})?$/.test(value)) {
      setError('weightGrams', {
        type: 'kilograms',
        message: 'Enter the weight in kg, for example 0.5',
      });
      return;
    }
    clearErrors('weightGrams');
    field.onChange(unit === 'kg' && value ? String(Math.round(Number(value) * 1000)) : value);
  };
  const changeUnit = (next: WeightUnit) => {
    setUnit(next);
    if (fieldState.error?.type === 'kilograms') {
      clearErrors('weightGrams');
      field.onChange(amount);
      return;
    }
    const grams = field.value;
    if (typeof grams === 'string' && /^\d+$/.test(grams))
      setAmount(next === 'kg' ? String(Number(grams) / 1000) : grams);
  };
  return (
    <>
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <FormField name="weightGrams" label="Parcel weight" optional>
            {(control) => (
              <Input
                {...control}
                ref={field.ref}
                value={amount}
                inputMode={unit === 'kg' ? 'decimal' : 'numeric'}
                onBlur={field.onBlur}
                onChange={(event) => changeAmount(event.target.value)}
              />
            )}
          </FormField>
        </div>
        <WeightUnitSelect unit={unit} onChange={changeUnit} />
      </div>
      <p className="text-sm text-text-muted">Orders use this weight to work out courier charges.</p>
    </>
  );
}

function WeightUnitSelect({
  unit,
  onChange,
}: {
  unit: WeightUnit;
  onChange: (unit: WeightUnit) => void;
}) {
  return (
    <Select value={unit} onValueChange={(value) => onChange(value === 'kg' ? 'kg' : 'g')}>
      <SelectTrigger aria-label="Weight unit" className="w-auto shrink-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="g">g</SelectItem>
        <SelectItem value="kg">kg</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function ProductDescriptionFields({ productId }: ProductFieldsProps) {
  return (
    <>
      <ProductDescriptionField productId={productId} />
      {productId ? (
        <ProductLinesField name="aliases" label="Other names" hint="One name per line." />
      ) : null}
    </>
  );
}

function ProductStockFields({ productId }: ProductFieldsProps) {
  return (
    <>
      <ProductTrackStock />
      {productId ? <ProductVisibilityFields /> : null}
    </>
  );
}

export function ProductVisibilityFields() {
  const form = useFormContext<ProductFormValues>();
  return (
    <div className="space-y-3">
      {extraFlags.map(([name, label]) => (
        <FormField key={name} name={name} label={label}>
          {(control) => (
            <Controller
              control={form.control}
              name={name}
              render={({ field }) => (
                <Checkbox
                  {...control}
                  checked={field.value}
                  onCheckedChange={(value) => field.onChange(value === true)}
                  onBlur={field.onBlur}
                  ref={field.ref}
                />
              )}
            />
          )}
        </FormField>
      ))}
    </div>
  );
}

function PlainProfit({ onPage }: Pick<ProductFieldsProps, 'onPage'>) {
  const form = useFormContext<ProductFormValues>();
  const regular = form.watch('pricePoisha');
  const sell = form.watch('compareAtPricePoisha');
  const [override, cost] = form.watch(['variants.0.priceOverridePoisha', 'variants.0.costPoisha']);
  const paidPrice = (onPage && (override || sell)) || regular;
  const profit = profitPercent(paidPrice, cost);
  return profit === null ? null : (
    <p className="text-sm text-text">
      Profit: <span className="font-medium">{profit}%</span>
    </p>
  );
}

function DefaultOverride() {
  const { getValues } = useFormContext<ProductFormValues>();
  const [visible] = useState(() => Boolean(getValues('variants.0.priceOverridePoisha')));
  if (!visible) return null;
  return (
    <ProductInputField
      name="variants.0.priceOverridePoisha"
      label="Default price override (Taka)"
    />
  );
}
