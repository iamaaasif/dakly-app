'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormProvider, useForm } from 'react-hook-form';

import {
  stockAdjustmentSchema,
  type ProductVariantResponse,
  type StockAdjustmentInput,
} from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';
import { Dialog } from '@dakly/ui/dialog';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';
import { Textarea } from '@dakly/ui/textarea';

import { useAdjustStock } from '../api/adjust-stock';

type StockAdjustmentFormProps = {
  productName: string;
  variant: ProductVariantResponse;
  onClose: () => void;
};
export function StockAdjustmentForm({ productName, variant, onClose }: StockAdjustmentFormProps) {
  const form = useForm<StockAdjustmentInput>({
    resolver: zodResolver(stockAdjustmentSchema),
    defaultValues: { reason: '' },
  });
  const adjustment = useAdjustStock();
  return (
    <Dialog title={`Adjust stock: ${productName} · ${variant.title}`} open onClose={onClose}>
      <p className="mb-4 rounded-md border border-border bg-surface-muted p-3 text-sm text-text-muted">
        On hand: {variant.onHand} · Reserved: {variant.reserved} · Available: {variant.available}
      </p>
      <FormProvider {...form}>
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit((input) =>
            adjustment.mutate({ variantId: variant.id, input }, { onSuccess: onClose }),
          )}
        >
          <FormField
            name="quantity"
            label="Change in stock"
            hint="Use a positive number to add stock or a negative number to remove it."
          >
            {(control) => (
              <Input
                {...control}
                type="number"
                step="1"
                {...form.register('quantity', { valueAsNumber: true })}
              />
            )}
          </FormField>
          <FormField name="reason" label="Reason">
            {(control) => <Textarea {...control} {...form.register('reason')} />}
          </FormField>
          {adjustment.error ? (
            <p role="alert" className="text-danger">
              {adjustment.error.message}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={adjustment.isPending}>
              Save stock
            </Button>
          </div>
        </form>
      </FormProvider>
    </Dialog>
  );
}
