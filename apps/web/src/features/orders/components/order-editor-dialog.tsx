import { useRef, useState } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';

import { formatMoney } from '@dakly/contracts/money';
import {
  type OrderDetail,
  type OrderCatalogueProduct,
  type OrderCatalogueStock,
  type OrderEditorValues,
} from '@dakly/contracts/orders';
import { takaInput } from '@dakly/contracts/products';
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
import { useOrderDelivery } from '@/lib/order-entry/get-delivery-charge';
import {
  useOrderCatalogueProducts,
  useOrderCatalogueStock,
} from '@/lib/order-entry/order-catalogue';

const newLine = { variantId: '', quantity: 1, lineDiscountPoisha: 0 };

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
