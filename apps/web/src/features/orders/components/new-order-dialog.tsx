import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { FormProvider, useFieldArray, useForm, useFormContext, useWatch } from 'react-hook-form';

import {
  createOrderSchema,
  type CreateOrderInput,
  type CreateOrderValues,
  type OrderDetail,
} from '@dakly/contracts/orders';
import { Button } from '@dakly/ui/button';

import { useOrderStage } from '../api/change-order-stage';
import { useCreateOrder } from '../api/create-order';
import { useOrderDelivery } from '../api/get-delivery-charge';
import { poishaInput } from '../order-money';
import { OrderBuyerFields } from './order-buyer-fields';
import { OrderProductFields, type VariantChoice } from './order-product-fields';
import { OrderRecipientFields } from './order-recipient-fields';
import { FormField } from '@/components/form-field';
import { SessionDialog } from '@/components/session-dialog';
import { formatMoney } from '@/lib/format-money';

const newLine = { variantId: '', quantity: 1, lineDiscountPoisha: 0 };

type NewOrderDialogProps = { onClose: () => void; onSaved: (id: string) => void };

export function NewOrderDialog({ onClose, onSaved }: NewOrderDialogProps) {
  const create = useCreateOrder();
  const transition = useOrderStage();
  const form = useForm<CreateOrderValues, undefined, CreateOrderInput>({
    resolver: zodResolver(createOrderSchema),
    defaultValues: {
      buyer: { name: '' },
      recipient: { name: '', phone: '', address: '', areaId: 0, isBuyer: true },
      items: [newLine],
    },
  });
  const pending = create.isPending || transition.isPending;
  const error = create.error ?? transition.error;
  const close = () => (create.data ? onSaved(create.data.id) : onClose());
  const confirm = (order: OrderDetail) =>
    transition.mutate(
      { id: order.id, body: { to: 'to_pack' } },
      { onSuccess: () => onSaved(order.id) },
    );
  const submit = (asConfirmed: boolean) =>
    form.handleSubmit((input) => {
      create.mutate(input, {
        onSuccess: (order) =>
          asConfirmed && order.stage === 'to_confirm' ? confirm(order) : onSaved(order.id),
      });
    });
  const confirmOrder = () => (create.data ? confirm(create.data) : void submit(true)());

  return (
    <SessionDialog
      title="New order"
      open
      onClose={close}
      closeDisabled={pending}
      className="max-h-[calc(100dvh-1rem)] max-w-2xl open:flex open:flex-col"
    >
      <form className="flex min-h-0 flex-col gap-3" onSubmit={submit(false)}>
        <div className="min-h-0 overflow-y-auto px-0.5">
          <fieldset disabled={pending || Boolean(create.data)} className="space-y-3">
            <FormProvider {...form}>
              <OrderBuyerFields />
              <OrderRecipientFields />
              <ItemsAndAmounts />
            </FormProvider>
          </fieldset>
        </div>
        {error && (
          <p role="alert" className="text-danger">
            {error.message}
          </p>
        )}
        <NewOrderActions
          saved={Boolean(create.data)}
          pending={pending}
          close={close}
          confirm={confirmOrder}
        />
      </form>
    </SessionDialog>
  );
}

function NewOrderActions({
  saved,
  pending,
  close,
  confirm,
}: {
  saved: boolean;
  pending: boolean;
  close: () => void;
  confirm: () => void;
}) {
  return (
    <div className="flex shrink-0 flex-wrap justify-end gap-2">
      <Button variant="secondary" onClick={close} disabled={pending}>
        {saved ? 'Open saved order' : 'Cancel'}
      </Button>
      {!saved && (
        <Button type="submit" disabled={pending}>
          Save order
        </Button>
      )}
      <Button variant="secondary" disabled={pending} onClick={confirm}>
        {saved ? 'Confirm saved order' : 'Save as confirmed'}
      </Button>
    </div>
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
      <div className="grid gap-2 sm:grid-cols-2">
        <FormField
          label="Discount (৳)"
          inputMode="decimal"
          field={register('orderDiscountPoisha', { setValueAs: poishaInput })}
        />
        <FormField
          label="Advance paid (৳)"
          inputMode="decimal"
          field={register('advancePaidPoisha', { setValueAs: poishaInput })}
        />
      </div>
      <OrderPreview variants={variants} />
      {(formState.errors.orderDiscountPoisha ||
        formState.errors.advancePaidPoisha ||
        formState.errors.deliveryChargePoisha) && (
        <p role="alert" className="text-danger">
          Enter amounts with up to two decimal places.
        </p>
      )}
    </>
  );
}

function OrderPreview({ variants }: { variants: Record<string, VariantChoice> }) {
  const [areaId, items, discount, advance, override] = useWatch<
    CreateOrderValues,
    [
      'recipient.areaId',
      'items',
      'orderDiscountPoisha',
      'advancePaidPoisha',
      'deliveryChargePoisha',
    ]
  >({
    name: [
      'recipient.areaId',
      'items',
      'orderDiscountPoisha',
      'advancePaidPoisha',
      'deliveryChargePoisha',
    ],
  });
  const quote = useOrderDelivery(areaId);
  const delivery = override ?? quote.data?.chargePoisha;
  if (delivery === undefined) return null;
  const subtotal = items.reduce(
    (sum, item) => sum + (variants[item.variantId]?.price ?? 0) * item.quantity,
    0,
  );
  const total = subtotal + delivery - (discount ?? 0);
  const cod = Math.max(0, total - (advance ?? 0));
  if (!Number.isSafeInteger(total) || total < 0 || !Number.isSafeInteger(cod)) return null;
  return (
    <p className="flex flex-wrap gap-x-4 rounded-md bg-surface-muted p-3">
      <span>
        Total <strong>{formatMoney(total)}</strong>
      </span>
      <span>
        Cash on delivery <strong>{formatMoney(cod)}</strong>
      </span>
    </p>
  );
}
