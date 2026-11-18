import { zodResolver } from '@hookform/resolvers/zod';
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
  type OrderEditorValues,
} from '@dakly/contracts/orders';
import { takaInput } from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';

import { useOrderStage } from '../api/change-order-stage';
import { useCreateOrder } from '../api/create-order';
import { useOrderDelivery } from '../api/get-delivery-charge';
import { useOrderCatalogueProducts } from '../api/order-catalogue';
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
  const confirmAfterSave = useRef(false);
  const saved = create.data;
  const pending = create.isPending || transition.isPending;
  const error = create.error ?? transition.error;
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
  function saveConfirmed() {
    if (saved) return confirm(saved);
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
  const items = useWatch({ control, name: 'items' });
  const savedProductIds = order?.items.flatMap(({ productId }) => productId ?? []) ?? [];
  const selectedProducts = useOrderCatalogueProducts([
    ...new Set([
      ...savedProductIds,
      ...items.flatMap(({ variantId }) => productIds.current[variantId] ?? []),
    ]),
  ]).flatMap(({ data }) => data ?? []);
  const variants = draftVariantChoices(selectedProducts, order);

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
          if (variant) productIds.current[id] = variant.productId;
          setValue(`items.${index}.variantId`, id, { shouldValidate: formState.isSubmitted });
        }}
      />
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

function draftVariantChoices(products: OrderCatalogueProduct[], order?: OrderDetail) {
  const variants = orderVariantChoices(products);
  for (const item of order?.items ?? []) {
    const live = products.find(({ id }) => id === item.productId);
    const stock = live?.isStockTracked
      ? live.variants.find(({ id }) => id === item.variantId)?.available
      : null;
    variants[item.variantId] = {
      productId: item.productId ?? '',
      label: [item.productName, item.variantTitle].filter(Boolean).join(' · '),
      price: item.unitPricePoisha,
      stock: stock ?? null,
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
  const charge = moneyInputOr(override, quote.chargePoisha);
  const orderDiscount = moneyInputOr(discount, order?.orderDiscountPoisha ?? 0);
  const paid = moneyInputOr(advance, order?.advancePaidPoisha ?? 0);
  if (charge === undefined || orderDiscount === undefined || paid === undefined) return null;
  const total = orderDraftSubtotal(items, variants) + charge - orderDiscount;
  if (!Number.isSafeInteger(total) || total < 0) return null;
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
  return items.reduce((sum, item) => {
    const variant = variants[item.variantId];
    return variant && Number.isSafeInteger(item.quantity) && item.quantity > 0
      ? sum + variant.price * item.quantity - (item.lineDiscountPoisha ?? 0)
      : NaN;
  }, 0);
}

function moneyInputOr(value: string | undefined, fallback?: number) {
  return value ? takaInput.safeParse(value).data : fallback;
}
