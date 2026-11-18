import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { FormProvider, useFieldArray, useForm, useFormContext, useWatch } from 'react-hook-form';

import {
  orderEditorSchema,
  type OrderEditorInput,
  type OrderEditorValues,
  type OrderDetail,
} from '@dakly/contracts/orders';
import { bdMobileSchema } from '@dakly/contracts/phone';
import { takaInput } from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';

import { useOrderStage } from '../api/change-order-stage';
import { useCreateOrder } from '../api/create-order';
import { useEditOrder } from '../api/edit-order';
import { useOrderDelivery } from '../api/get-delivery-charge';
import { OrderProductFields, type VariantChoice } from './order-product-fields';
import { OrderRecipientFields } from './order-recipient-fields';
import { SessionDialog } from '@/components/session-dialog';
import { formatMoney, takaInputFromPoisha } from '@/lib/format-money';

const newLine = { variantId: '', quantity: 1, lineDiscountPoisha: 0 };

type OrderEditorDialogProps = {
  order?: OrderDetail;
  onClose: () => void;
  onSaved: (id: string) => void;
};

function initialOrder(order?: OrderDetail): OrderEditorValues {
  if (!order)
    return {
      mode: 'new',
      buyer: { name: '' },
      recipient: { name: '', phone: '', address: '', areaId: 0, isBuyer: true },
      items: [newLine],
    };
  const phone = bdMobileSchema.safeParse(order.recipientPhone);
  return {
    mode: 'edit',
    recipient: {
      name: order.recipientName,
      phone: phone.success ? phone.data : undefined,
      address: order.recipientAddress,
      isBuyer: order.isRecipientBuyer,
    },
    items: order.items.map(({ variantId, quantity, lineDiscountPoisha }) => ({
      variantId,
      quantity,
      lineDiscountPoisha,
    })),
    orderDiscountPoisha: takaInputFromPoisha(order.orderDiscountPoisha),
    advancePaidPoisha: takaInputFromPoisha(order.advancePaidPoisha),
  };
}

function useOrderEditorSubmission({ order, onClose, onSaved }: OrderEditorDialogProps) {
  const create = useCreateOrder();
  const edit = useEditOrder();
  const transition = useOrderStage();
  const close = () => (create.data ? onSaved(create.data.id) : onClose());
  const confirm = (saved: OrderDetail) =>
    transition.mutate(
      { id: saved.id, body: { to: 'to_pack' } },
      { onSuccess: () => onSaved(saved.id) },
    );
  function submit(input: OrderEditorInput, asConfirmed: boolean) {
    const body = {
      items: input.items,
      recipient: input.recipient,
      deliveryChargePoisha: input.deliveryChargePoisha,
      orderDiscountPoisha: input.orderDiscountPoisha,
      advancePaidPoisha: input.advancePaidPoisha,
    };
    if (input.mode === 'new') {
      create.mutate(
        {
          ...body,
          buyer: input.buyer,
          recipient: input.recipient,
          orderDiscountPoisha: input.orderDiscountPoisha,
          advancePaidPoisha: input.advancePaidPoisha,
        },
        {
          onSuccess: (saved) =>
            asConfirmed && saved.stage === 'to_confirm' ? confirm(saved) : onSaved(saved.id),
        },
      );
    } else if (order) {
      edit.mutate({ id: order.id, body }, { onSuccess: () => onSaved(order.id) });
    }
  }
  return {
    close,
    submit,
    confirm,
    saved: create.data,
    pending: create.isPending || edit.isPending || transition.isPending,
    error: create.error ?? edit.error ?? transition.error,
  };
}

export function OrderEditorDialog(props: OrderEditorDialogProps) {
  const { order } = props;
  const { close, submit, confirm, saved, pending, error } = useOrderEditorSubmission(props);
  const form = useForm<OrderEditorValues, undefined, OrderEditorInput>({
    resolver: zodResolver(orderEditorSchema),
    defaultValues: initialOrder(order),
  });
  const confirmOrder = () =>
    saved ? confirm(saved) : void form.handleSubmit((input) => submit(input, true))();

  return (
    <SessionDialog
      title={order ? 'Edit order' : 'New order'}
      open
      onClose={close}
      closeDisabled={pending}
      className="max-h-[calc(100dvh-1rem)] max-w-2xl open:flex open:flex-col"
    >
      <form
        className="flex min-h-0 flex-col gap-3"
        onSubmit={form.handleSubmit((input) => submit(input, false))}
      >
        <div className="min-h-0 overflow-y-auto px-0.5">
          <fieldset disabled={pending || Boolean(saved)} className="space-y-3">
            <FormProvider {...form}>
              <OrderRecipientFields order={order} />
              <ItemsAndAmounts order={order} />
            </FormProvider>
          </fieldset>
        </div>
        {error && (
          <p role="alert" className="text-danger">
            {error.message}
          </p>
        )}
        <OrderEditorActions
          saved={Boolean(saved)}
          pending={pending}
          close={close}
          confirm={order ? undefined : confirmOrder}
        />
      </form>
    </SessionDialog>
  );
}

function OrderEditorActions({
  saved,
  pending,
  close,
  confirm,
}: {
  saved: boolean;
  pending: boolean;
  close: () => void;
  confirm?: () => void;
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
      {confirm && (
        <Button variant="secondary" disabled={pending} onClick={confirm}>
          {saved ? 'Confirm saved order' : 'Save as confirmed'}
        </Button>
      )}
    </div>
  );
}

function ItemsAndAmounts({ order }: { order?: OrderDetail }) {
  const [variants, setVariants] = useState<Record<string, VariantChoice>>(() =>
    Object.fromEntries(
      order?.items.map((item) => [
        item.variantId,
        {
          label: [item.productName, item.variantTitle].filter(Boolean).join(' · '),
          price: item.unitPricePoisha,
          stock: null,
        },
      ]) ?? [],
    ),
  );
  const { control, register, setValue, formState } = useFormContext<OrderEditorValues>();
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
          if (variant) setVariants((current) => ({ ...current, [id]: current[id] ?? variant }));
          setValue(`items.${index}.variantId`, id);
        }}
      />
      {formState.errors.items && (
        <p role="alert" className="text-danger">
          Choose a different variant for each line and enter a positive quantity.
        </p>
      )}
      <OrderAmountFields order={order} />
      <OrderPreview order={order} variants={variants} />
    </>
  );
}

function OrderAmountFields({ order }: { order?: OrderDetail }) {
  const { register } = useFormContext<OrderEditorValues>();
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {(
        [
          ['orderDiscountPoisha', 'Discount (৳)'],
          ['advancePaidPoisha', 'Advance paid (৳)'],
        ] as const
      ).map(([name, label]) => (
        <FormField key={name} name={name} label={label}>
          {(props) => (
            <Input
              {...props}
              inputMode="decimal"
              readOnly={name === 'advancePaidPoisha' && Boolean(order?.advancePaidPoisha)}
              {...register(name, { setValueAs: (value: string) => value.trim() || undefined })}
            />
          )}
        </FormField>
      ))}
    </div>
  );
}

function OrderPreview({
  order,
  variants,
}: {
  order?: OrderDetail;
  variants: Record<string, VariantChoice>;
}) {
  const [areaId, items, discount, advance, override] = useWatch<
    OrderEditorValues,
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
  const quote = useOrderDelivery(areaId, order);
  const delivery = moneyInputOr(override, quote.chargePoisha);
  const discountPoisha = moneyInputOr(discount, order?.orderDiscountPoisha ?? 0);
  const paid = moneyInputOr(advance, order?.advancePaidPoisha ?? 0);
  if (delivery === undefined || discountPoisha === undefined || paid === undefined) return null;
  const subtotal = items.reduce(
    (sum, item) =>
      sum + (variants[item.variantId]?.price ?? 0) * item.quantity - (item.lineDiscountPoisha ?? 0),
    0,
  );
  const total = subtotal + delivery - discountPoisha;
  const cod = Math.max(0, total - paid);
  return <OrderPricePreview total={total} cod={cod} />;
}

function OrderPricePreview({ total, cod }: { total: number; cod: number }) {
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

function moneyInputOr(value: string | undefined, fallback?: number) {
  return value ? takaInput.safeParse(value).data : fallback;
}
