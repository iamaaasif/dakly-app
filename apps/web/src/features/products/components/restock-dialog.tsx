'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { type FieldErrors, FormProvider, useForm, useFormContext } from 'react-hook-form';

import type { ProductResponse } from '@dakly/contracts/products';
import { restockStockSchema, type RestockStockInput } from '@dakly/contracts/restock-requests';
import { Button } from '@dakly/ui/button';
import { Checkbox } from '@dakly/ui/checkbox';
import { Dialog } from '@dakly/ui/dialog';
import { Input } from '@dakly/ui/input';
import { Label } from '@dakly/ui/label';

import { useRestockWaiting } from '../api/get-restock-waiting';
import { useRestockSubmit } from './restock-submit';

type RestockDialogProps = { product: ProductResponse; onClose: () => void };

export function RestockDialog({ product, onClose }: RestockDialogProps) {
  const waiting = useRestockWaiting(product.id);
  const waitingBySize = new Map(waiting.data?.items.map((item) => [item.variantId, item.waiting]));
  const anyWaiting = [...waitingBySize.values()].some((count) => count > 0);
  const form = useForm<RestockStockInput>({
    resolver: zodResolver(restockStockSchema),
    defaultValues: {
      // An empty box shows the +0 hint and counts as no pieces.
      quantities: {},
      notify: true,
    },
  });
  const { save, restock } = useRestockSubmit(form, waitingBySize, onClose);
  const quantitiesMessage = quantitiesErrorMessage(form.formState.errors.quantities);
  return (
    <Dialog title={`Restock ${product.name}`} open onClose={onClose} className="max-w-md">
      <FormProvider {...form}>
        <form className="space-y-4" onSubmit={save}>
          <p className="text-sm text-text-muted">How many new pieces did you get?</p>
          <ul className="space-y-3">
            {product.variants.map((variant) => (
              <RestockSize
                key={variant.id}
                variant={variant}
                waiting={waitingBySize.get(variant.id) ?? 0}
              />
            ))}
          </ul>
          {quantitiesMessage ? (
            <p role="alert" className="text-sm text-danger">
              {quantitiesMessage}
            </p>
          ) : null}
          {anyWaiting ? <NotifyWaiting /> : null}
          {restock.error ? (
            <p role="alert" className="text-sm text-danger">
              {restock.error.message}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={restock.isPending}>
              Save stock
            </Button>
          </div>
        </form>
      </FormProvider>
    </Dialog>
  );
}

type RestockSizeProps = { variant: ProductResponse['variants'][number]; waiting: number };

function RestockSize({ variant, waiting }: RestockSizeProps) {
  const { register } = useFormContext<RestockStockInput>();
  return (
    <li className="flex items-center gap-3">
      <Label
        htmlFor={`restock-${variant.id}`}
        className="max-w-[30%] min-w-8 font-semibold break-all"
      >
        {variant.title}
      </Label>
      <span className="min-w-0 flex-1 text-sm text-text-muted">
        {variant.available} now
        {waiting > 0 ? <span className="font-medium text-action"> · {waiting} waiting</span> : null}
      </span>
      <Input
        id={`restock-${variant.id}`}
        type="number"
        min={0}
        step={1}
        inputMode="numeric"
        placeholder="+0"
        className="w-24 shrink-0"
        {...register(`quantities.${variant.id}`, {
          setValueAs: (value) => (value === '' ? 0 : Number(value)),
        })}
      />
    </li>
  );
}

function NotifyWaiting() {
  const { watch, setValue } = useFormContext<RestockStockInput>();
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id="restock-notify"
        checked={watch('notify')}
        onCheckedChange={(checked) => setValue('notify', checked === true)}
      />
      <Label htmlFor="restock-notify" className="text-sm">
        Message the people who were waiting for these sizes
      </Label>
    </div>
  );
}

type QuantitiesError = FieldErrors<RestockStockInput>['quantities'];

// A record of boxes reports its own error under root, and a box's error under its size.
function quantitiesErrorMessage(error: QuantitiesError) {
  if (!error) return undefined;
  const message = error.root?.message ?? error.message;
  return typeof message === 'string' ? message : 'Enter a whole number of pieces for each size';
}
