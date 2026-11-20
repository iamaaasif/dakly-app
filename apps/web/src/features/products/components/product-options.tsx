'use client';
import { useFieldArray, useFormContext } from 'react-hook-form';

import type { ProductFormValues } from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';

import { ProductSizes } from './product-sizes';
import { ProductVariants } from './product-variants';

type ProductOptionsProps = {
  mode?: 'create' | 'edit';
  sizeStocks?: Record<number, number>;
  onStockChange?: (index: number, quantity: number) => void;
};

export function ProductOptions({
  mode = 'edit',
  sizeStocks,
  onStockChange,
}: ProductOptionsProps) {
  const form = useFormContext<ProductFormValues>();
  const isStockTracked = form.watch('isStockTracked');
  const options = form.watch('options') ?? [];
  const { append } = useFieldArray({ control: form.control, name: 'options' });

  if (mode === 'create' && isStockTracked && options.length <= 1) {
    return (
      <ProductSizes
        sizeStocks={sizeStocks}
        onStockChange={onStockChange}
        onAddOption={() => append({ name: '', values: [] })}
      />
    );
  }

  return <ProductVariants />;
}
