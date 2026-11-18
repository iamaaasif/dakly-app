import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { FormProvider, useFieldArray, useForm, useFormContext, useWatch } from 'react-hook-form';

import {
  createOrderSchema,
  type CreateOrderInput,
  type CreateOrderValues,
} from '@dakly/contracts/orders';
import { Button } from '@dakly/ui/button';

import { useCreateOrder } from '../api/create-order';
import { useOrderDelivery } from '../api/get-delivery-charge';
import { OrderProductFields, type VariantChoice } from './order-product-fields';
import { OrderRecipientFields } from './order-recipient-fields';
import { SessionDialog } from '@/components/session-dialog';
import { formatMoney } from '@/lib/format-money';

const newLine = { variantId: '', quantity: 1, lineDiscountPoisha: 0 };
const newOrderFormSchema = createOrderSchema.omit({ buyer: true });

type NewOrderDialogProps = { onClose: () => void; onSaved: (id: string) => void };

export function NewOrderDialog({ onClose, onSaved }: NewOrderDialogProps) {
  const create = useCreateOrder();
  const form = useForm<
    Omit<CreateOrderValues, 'buyer'>,
    undefined,
    Omit<CreateOrderInput, 'buyer'>
  >({
    resolver: zodResolver(newOrderFormSchema),
    defaultValues: {
      recipient: { name: '', phone: '', address: '', areaId: 0, isBuyer: true },
      items: [newLine],
    },
  });
  const submit = form.handleSubmit((input) => {
    create.mutate(
      { ...input, buyer: { name: input.recipient.name, phone: input.recipient.phone } },
      { onSuccess: (order) => onSaved(order.id) },
    );
  });

  return (
    <SessionDialog
      title="New order"
      open
      onClose={onClose}
      closeDisabled={create.isPending}
      className="max-h-[calc(100dvh-1rem)] max-w-2xl open:flex open:flex-col"
    >
      <FormProvider {...form}>
        <form className="flex min-h-0 flex-col gap-3" onSubmit={submit}>
          <fieldset
            disabled={create.isPending}
            className="min-h-0 space-y-3 overflow-y-auto px-0.5"
          >
            <OrderRecipientFields />
            <ItemsAndAmounts />
          </fieldset>
          {create.error && (
            <p role="alert" className="text-danger">
              {create.error.message}
            </p>
          )}
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              Save order
            </Button>
          </div>
        </form>
      </FormProvider>
    </SessionDialog>
  );
}

function ItemsAndAmounts() {
  const [variants, setVariants] = useState<Record<string, VariantChoice>>({});
  const { control, register, setValue, formState } = useFormContext<CreateOrderValues>();
  const { fields, append, remove } = useFieldArray({ name: 'items', control });
  const items = useWatch({ control, name: 'items' });

  return (
    <>
      <OrderProductFields
        fields={fields}
        ids={items.map(({ variantId }) => variantId)}
        variants={variants}
        register={register}
        onAdd={() => append(newLine)}
        onRemove={remove}
        onChoose={(index, id, variant) => {
          if (variant) setVariants((current) => ({ ...current, [id]: variant }));
          setValue(`items.${index}.variantId`, id);
        }}
      />
      {formState.errors.items && (
        <p role="alert" className="text-danger">
          Choose a different variant for each line and enter a positive quantity.
        </p>
      )}
      <OrderPreview variants={variants} />
    </>
  );
}

function OrderPreview({ variants }: { variants: Record<string, VariantChoice> }) {
  const [areaId, items, override] = useWatch<
    CreateOrderValues,
    ['recipient.areaId', 'items', 'deliveryChargePoisha']
  >({ name: ['recipient.areaId', 'items', 'deliveryChargePoisha'] });
  const quote = useOrderDelivery(areaId);
  const delivery = override ?? quote.data?.chargePoisha;
  if (delivery === undefined) return null;
  const total = items.reduce(
    (sum, item) => sum + (variants[item.variantId]?.price ?? 0) * item.quantity,
    delivery,
  );
  if (!Number.isSafeInteger(total) || total < 0) return null;
  return (
    <p className="rounded-md bg-surface-muted p-3">
      Cash on delivery <strong>{formatMoney(total)}</strong>
    </p>
  );
}
