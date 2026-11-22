import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState, type FormEvent } from 'react';
import {
  FormProvider,
  useFieldArray,
  useForm,
  useFormContext,
  useWatch,
  type Resolver,
} from 'react-hook-form';

import { formatMoney } from '@dakly/contracts/money';
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
import { cn } from '@dakly/ui/cn';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';
import { QueryError } from '@dakly/ui/query-error';

import {
  OrderProductFields,
  orderVariantChoices,
  type VariantChoice,
} from './order-product-fields';
import { OrderRecipientFields } from './order-recipient-fields';
import { SessionDialog } from '@/components/session-dialog';
import { useCreateOrder } from '@/lib/order-entry/create-order';
import { useOrderDelivery } from '@/lib/order-entry/get-delivery-charge';
import {
  useOrderCatalogueProducts,
  useOrderCatalogueStock,
} from '@/lib/order-entry/order-catalogue';

const newLine = { variantId: '', quantity: 1, lineDiscountPoisha: 0 };
const newOrderDefaults: CreateOrderValues = {
  buyer: { name: '' },
  recipient: { name: '', phone: '', address: '', areaId: 0, isBuyer: true },
  items: [newLine],
};
const parseNewOrder = zodResolver(createOrderFormSchema);
const resolveNewOrder: Resolver<CreateOrderValues, undefined, CreateOrderInput> = (
  values,
  context,
  options,
) =>
  parseNewOrder(
    values.recipient.isBuyer && 'name' in values.buyer
      ? { ...values, buyer: { name: values.recipient.name } }
      : values,
    context,
    options,
  );

type NewOrderDialogProps = { onClose: () => void; onSaved: (id: string) => void };

export function NewOrderDialog({ onClose, onSaved }: NewOrderDialogProps) {
  const create = useCreateOrder();
  const form = useForm<CreateOrderValues, undefined, CreateOrderInput>({
    resolver: resolveNewOrder,
    defaultValues: newOrderDefaults,
  });
  const busy = create.isPending || create.mustRetry;
  function save(input: CreateOrderInput) {
    create.mutate(input, { onSuccess: (order) => onSaved(order.id) });
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    if (!create.mustRetry) return void form.handleSubmit(save)(event);
    event.preventDefault();
    if (create.variables) save(create.variables);
  }

  return (
    <SessionDialog
      title="New order"
      open
      onClose={onClose}
      closeDisabled={busy}
      className="max-h-[calc(100dvh-1rem)] max-w-160 p-4 open:flex open:flex-col sm:p-6"
    >
      <FormProvider {...form}>
        <form className="flex min-h-0 flex-col gap-3" onSubmit={submit}>
          <div className="min-h-0 overflow-y-auto px-0.5">
            <fieldset disabled={busy} className="space-y-3">
              <OrderEditorFields />
            </fieldset>
          </div>
          {create.error && (
            <p role="alert" className="text-danger">
              {create.mustRetry
                ? 'Could not confirm the save. Retry with the same order details.'
                : create.error.message}
            </p>
          )}
          <NewOrderActions
            busy={busy}
            isPending={create.isPending}
            mustRetry={create.mustRetry}
            onClose={onClose}
            onSaveConfirmed={form.handleSubmit((input) => save({ ...input, confirm: true }))}
          />
        </form>
      </FormProvider>
    </SessionDialog>
  );
}

type NewOrderActionsProps = {
  busy: boolean;
  isPending: boolean;
  mustRetry: boolean;
  onClose: () => void;
  onSaveConfirmed: () => void;
};

function NewOrderActions({
  busy,
  isPending,
  mustRetry,
  onClose,
  onSaveConfirmed,
}: NewOrderActionsProps) {
  return (
    <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border pt-3">
      <Button
        variant="secondary"
        onClick={onClose}
        disabled={busy}
        className="min-h-11 sm:min-h-10"
      >
        Cancel
      </Button>
      <Button type="submit" loading={isPending} className="min-h-11 sm:min-h-10">
        {mustRetry ? 'Retry save' : 'Save order'}
      </Button>
      <Button
        variant="secondary"
        disabled={busy}
        className="min-h-11 sm:min-h-10"
        onClick={onSaveConfirmed}
      >
        Save as confirmed
      </Button>
    </div>
  );
}

export type OrderEditorFieldsProps = { order?: OrderDetail };

export function OrderEditorFields({ order }: OrderEditorFieldsProps) {
  return (
    <>
      <OrderRecipientFields order={order} />
      <ItemsAndAmounts order={order} />
    </>
  );
}

type ItemsAndAmountsProps = { order?: OrderDetail };

function ItemsAndAmounts({ order }: ItemsAndAmountsProps) {
  const productIds = useRef<Record<string, string>>({});
  const [pickedVariants, setPickedVariants] = useState<Record<string, VariantChoice>>({});
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
  const variants = order
    ? draftVariantChoices(selectedProducts, order, stock.data)
    : pickedVariants;

  return (
    <>
      <OrderProductFields
        fields={fields}
        ids={items.map(({ variantId }) => variantId)}
        variants={variants}
        isNew={!order}
        register={register}
        onAdd={() => append(newLine)}
        onRemove={remove}
        onChoose={(index, id, variant) => {
          if (order && variant?.productId) productIds.current[id] = variant.productId;
          if (!order && variant) setPickedVariants((previous) => ({ ...previous, [id]: variant }));
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
      <OrderAmountFields hasAdvance={Boolean(order?.advancePaidPoisha)} isNew={!order} />
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

type OrderAmountFieldsProps = { hasAdvance: boolean; isNew: boolean };

function OrderAmountFields({ hasAdvance, isNew }: OrderAmountFieldsProps) {
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
              placeholder={isNew ? '0' : undefined}
              readOnly={name === 'advancePaidPoisha' && hasAdvance}
              {...register(name, { setValueAs: (value: string) => value.trim() || undefined })}
            />
          )}
        </FormField>
      ))}
    </div>
  );
}

type OrderPreviewProps = {
  variants: Record<string, VariantChoice>;
  order?: OrderDetail;
};

function OrderPreview({ variants, order }: OrderPreviewProps) {
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
  return <OrderPreviewTotals total={total} cod={Math.max(0, total - paid)} isNew={!order} />;
}

function OrderPreviewTotals({ total, cod, isNew }: { total: number; cod: number; isNew: boolean }) {
  return (
    <p
      className={cn(
        'flex flex-wrap items-center rounded-lg bg-surface-muted p-3 text-sm tabular-nums',
        isNew ? 'gap-x-3' : 'justify-between',
      )}
    >
      <span>
        Total <strong className="font-semibold text-text">{formatMoney(total)}</strong>
      </span>
      {isNew && <span aria-hidden="true">·</span>}
      <span>
        Cash on delivery <strong className="font-semibold text-text">{formatMoney(cod)}</strong>
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
