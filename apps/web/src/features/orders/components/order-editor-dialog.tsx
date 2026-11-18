import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, type FormEvent } from 'react';
import {
  FormProvider,
  useFieldArray,
  useForm,
  useFormContext,
  useWatch,
  type UseFormHandleSubmit,
} from 'react-hook-form';

import {
  createOrderFormSchema,
  type CreateOrderInput,
  type CreateOrderValues,
  type OrderDetail,
  type OrderCatalogueProduct,
  type OrderCatalogueStock,
  type OrderEditorValues,
} from '@dakly/contracts/orders';
import { takaInput } from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';
import { QueryError } from '@dakly/ui/query-error';

import { useOrderStage } from '../api/change-order-stage';
import { useCreateOrder } from '../api/create-order';
import { useOrderDelivery } from '../api/get-delivery-charge';
import { useOrder } from '../api/get-order';
import { useOrderCatalogueProducts, useOrderCatalogueStock } from '../api/order-catalogue';
import { ordersKey } from '../api/orders';
import {
  OrderProductFields,
  orderVariantChoices,
  type VariantChoice,
} from './order-product-fields';
import { OrderRecipientFields } from './order-recipient-fields';
import { SessionDialog } from '@/components/session-dialog';
import { formatMoney } from '@/lib/format-money';

const newLine = { variantId: '', quantity: 1, lineDiscountPoisha: 0 };

type NewOrderDialogProps = { onClose: () => void; onSaved: (id: string) => void };

export function NewOrderDialog({ onClose, onSaved }: NewOrderDialogProps) {
  const form = useForm<CreateOrderValues, undefined, CreateOrderInput>({
    resolver: zodResolver(createOrderFormSchema),
    defaultValues: {
      buyer: { name: '' },
      recipient: { name: '', phone: '', address: '', areaId: 0, isBuyer: true },
      items: [newLine],
    },
  });

  const { saved, pending, retry, error, close, submit, saveConfirmed } = useNewOrderSubmission(
    { onClose, onSaved },
    form.handleSubmit,
  );

  return (
    <SessionDialog
      title="New order"
      open
      onClose={close}
      closeDisabled={pending || retry}
      className="max-h-[calc(100dvh-1rem)] max-w-2xl open:flex open:flex-col"
    >
      <FormProvider {...form}>
        <form className="flex min-h-0 flex-col gap-3" onSubmit={submit}>
          <div className="min-h-0 overflow-y-auto px-0.5">
            <fieldset disabled={pending || retry || saved} className="space-y-3">
              <OrderEditorFields />
            </fieldset>
          </div>
          {error && (
            <p role="alert" className="text-danger">
              {retry
                ? 'Could not confirm the save. Retry with the same order details.'
                : error.message}
            </p>
          )}
          <OrderSaveActions
            saved={saved}
            retry={retry}
            pending={pending}
            onClose={close}
            onConfirm={saveConfirmed}
          />
        </form>
      </FormProvider>
    </SessionDialog>
  );
}

function useNewOrderSubmission(
  { onClose, onSaved }: NewOrderDialogProps,
  handleSubmit: UseFormHandleSubmit<CreateOrderValues, CreateOrderInput>,
) {
  const create = useCreateOrder();
  const transition = useOrderStage();
  const client = useQueryClient();
  const confirmAfterSave = useRef(false);
  const saved = create.data;
  const latest = useOrder(saved?.id ?? '', false);
  const pending = create.isPending || transition.isPending || latest.isFetching;
  const error = create.error ?? latest.error ?? transition.error;
  const close = () => (saved ? onSaved(saved.id) : onClose());
  function confirm(order: OrderDetail) {
    transition.mutate(
      { id: order.id, body: { to: 'to_pack' } },
      { onSuccess: () => onSaved(order.id) },
    );
  }
  function save(input: CreateOrderInput) {
    create.mutate(input, {
      onSuccess: (order) =>
        confirmAfterSave.current && order.stage === 'to_confirm'
          ? confirm(order)
          : onSaved(order.id),
    });
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    if (create.mustRetry) {
      event.preventDefault();
      if (create.variables) save(create.variables);
    } else {
      confirmAfterSave.current = false;
      void handleSubmit(save)(event);
    }
  }
  async function saveConfirmed() {
    if (saved) {
      const { data: current, isSuccess } = await latest.refetch();
      if (!isSuccess) return;
      if (current.stage === 'to_confirm') return confirm(current);
      void client.invalidateQueries({ queryKey: ordersKey });
      onSaved(current.id);
      return;
    }
    confirmAfterSave.current = true;
    void handleSubmit(save)();
  }

  return {
    saved: Boolean(saved),
    pending,
    retry: create.mustRetry,
    error,
    close,
    submit,
    saveConfirmed,
  };
}

type OrderSaveActionsProps = {
  saved: boolean;
  retry: boolean;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

function OrderSaveActions({ saved, retry, pending, onClose, onConfirm }: OrderSaveActionsProps) {
  return (
    <div className="flex shrink-0 flex-wrap justify-end gap-2">
      <Button variant="secondary" disabled={pending || retry} onClick={onClose}>
        {saved ? 'Open saved order' : 'Cancel'}
      </Button>
      {!saved && (
        <Button type="submit" loading={pending}>
          {retry ? 'Retry save' : 'Save order'}
        </Button>
      )}
      <Button variant="secondary" disabled={pending || retry} onClick={onConfirm}>
        {saved ? 'Confirm saved order' : 'Save as confirmed'}
      </Button>
    </div>
  );
}

export function OrderEditorFields({ order }: { order?: OrderDetail }) {
  return (
    <>
      <OrderRecipientFields order={order} />
      <ItemsAndAmounts order={order} />
    </>
  );
}

function ItemsAndAmounts({ order }: { order?: OrderDetail }) {
  const productIds = useRef<Record<string, string>>({});
  const { control, register, setValue, formState } = useFormContext<OrderEditorValues>();
  const { fields, append, remove } = useFieldArray({ name: 'items', control });
  const items = useWatch({ control, name: 'items' }) ?? [];
  const stock = useOrderCatalogueStock(
    order?.items.filter(({ isStockTracked }) => isStockTracked).map(({ variantId }) => variantId) ??
      [],
  );
  const selectedProducts = useOrderCatalogueProducts([
    ...new Set(items.flatMap(({ variantId }) => productIds.current[variantId] ?? [])),
  ]).flatMap(({ data }) => data ?? []);
  const variants = draftVariantChoices(selectedProducts, order, stock.data);

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
          if (variant?.productId) productIds.current[id] = variant.productId;
          const savedLine = order?.items.find((item) => item.variantId === id);
          setValue(`items.${index}.lineDiscountPoisha`, savedLine?.lineDiscountPoisha ?? 0, {
            shouldDirty: true,
          });
          setValue(`items.${index}.variantId`, id, {
            shouldDirty: true,
            shouldValidate: formState.isSubmitted,
          });
        }}
      />
      {stock.error && (
        <QueryError
          message={stock.error.message}
          onRetry={() => void stock.refetch()}
          retryLabel="Retry stock"
        />
      )}
      {formState.errors.items && (
        <p role="alert" className="text-danger">
          Choose a different variant for each line and enter a positive quantity.
        </p>
      )}
      <OrderAmountFields hasAdvance={Boolean(order?.advancePaidPoisha)} />
      <OrderPreview variants={variants} order={order} />
    </>
  );
}

function draftVariantChoices(
  products: OrderCatalogueProduct[],
  order?: OrderDetail,
  stock?: OrderCatalogueStock,
) {
  const variants = orderVariantChoices(products);
  const stockByVariant = new Map(stock?.map(({ variantId, available }) => [variantId, available]));
  for (const item of order?.items ?? []) {
    variants[item.variantId] = {
      label: [item.productName, item.variantTitle].filter(Boolean).join(' · '),
      price: item.unitPricePoisha,
      stock: item.isStockTracked ? (stockByVariant.get(item.variantId) ?? null) : null,
    };
  }
  return variants;
}

function OrderAmountFields({ hasAdvance }: { hasAdvance: boolean }) {
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
              readOnly={name === 'advancePaidPoisha' && hasAdvance}
              {...register(name, { setValueAs: (value: string) => value.trim() || undefined })}
            />
          )}
        </FormField>
      ))}
    </div>
  );
}

function OrderPreview({
  variants,
  order,
}: {
  variants: Record<string, VariantChoice>;
  order?: OrderDetail;
}) {
  const [areaId, items, override, discount, advance] = useWatch<
    OrderEditorValues,
    [
      'recipient.areaId',
      'items',
      'deliveryChargePoisha',
      'orderDiscountPoisha',
      'advancePaidPoisha',
    ]
  >({
    name: [
      'recipient.areaId',
      'items',
      'deliveryChargePoisha',
      'orderDiscountPoisha',
      'advancePaidPoisha',
    ],
  });
  const quote = useOrderDelivery(areaId, order);
  const charge = override ? takaInput.safeParse(override).data : quote.chargePoisha;
  const orderDiscount = moneyInputOr(discount);
  const paid = moneyInputOr(advance, order?.advancePaidPoisha);
  const subtotal = orderDraftSubtotal(items, variants);
  if (!Number.isSafeInteger(subtotal) || orderDiscount === undefined) return null;
  if (orderDiscount > subtotal) {
    return (
      <p role="alert" className="text-danger">
        Discount cannot exceed the item total.
      </p>
    );
  }
  if (charge === undefined || paid === undefined) return null;
  const total = subtotal - orderDiscount + charge;
  if (!Number.isSafeInteger(total)) return null;
  return (
    <p className="flex flex-wrap gap-x-4 rounded-md bg-surface-muted p-3">
      <span>
        Total <strong>{formatMoney(total)}</strong>
      </span>
      <span>
        Cash on delivery <strong>{formatMoney(Math.max(0, total - paid))}</strong>
      </span>
    </p>
  );
}

function orderDraftSubtotal(
  items: OrderEditorValues['items'],
  variants: Record<string, VariantChoice>,
) {
  return (items ?? []).reduce((sum, item) => {
    const variant = variants[item.variantId];
    if (!variant || !Number.isSafeInteger(item.quantity) || item.quantity <= 0) return NaN;
    const net = variant.price * item.quantity - (item.lineDiscountPoisha ?? 0);
    return net >= 0 ? sum + net : NaN;
  }, 0);
}

function moneyInputOr(value: string | undefined, fallback = 0) {
  return value ? takaInput.safeParse(value).data : fallback;
}
