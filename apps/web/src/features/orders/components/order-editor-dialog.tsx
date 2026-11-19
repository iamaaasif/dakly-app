import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, type FormEvent } from 'react';
import { FormProvider, useFieldArray, useForm, useFormContext, useWatch } from 'react-hook-form';

import {
  createOrderFormSchema,
  type CreateOrderInput,
  type CreateOrderValues,
} from '@dakly/contracts/orders';
import { takaInput } from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';

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
const newOrderDefaults: CreateOrderValues = {
  buyer: { name: '' },
  recipient: { name: '', phone: '', address: '', areaId: 0, isBuyer: true },
  items: [newLine],
};

type NewOrderDialogProps = { onClose: () => void; onSaved: (id: string) => void };

export function NewOrderDialog({ onClose, onSaved }: NewOrderDialogProps) {
  const create = useCreateOrder();
  const form = useForm<CreateOrderValues, undefined, CreateOrderInput>({
    resolver: zodResolver(createOrderFormSchema),
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
      className="max-h-[calc(100dvh-1rem)] max-w-2xl open:flex open:flex-col"
    >
      <FormProvider {...form}>
        <form className="flex min-h-0 flex-col gap-3" onSubmit={submit}>
          <div className="min-h-0 overflow-y-auto px-0.5">
            <fieldset disabled={busy} className="space-y-3">
              <OrderRecipientFields />
              <ItemsAndAmounts />
            </fieldset>
          </div>
          {create.error && (
            <p role="alert" className="text-danger">
              {create.mustRetry
                ? 'Could not confirm the save. Retry with the same order details.'
                : create.error.message}
            </p>
          )}
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              {create.mustRetry ? 'Retry save' : 'Save order'}
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={form.handleSubmit((input) => save({ ...input, confirm: true }))}
            >
              Save as confirmed
            </Button>
          </div>
        </form>
      </FormProvider>
    </SessionDialog>
  );
}

function ItemsAndAmounts() {
  const productIds = useRef<Record<string, string>>({});
  const { control, register, setValue, formState } = useFormContext<CreateOrderValues>();
  const { fields, append, remove } = useFieldArray({ name: 'items', control });
  const items = useWatch({ control, name: 'items' });
  const selectedProducts = useOrderCatalogueProducts([
    ...new Set(items.flatMap(({ variantId }) => productIds.current[variantId] ?? [])),
  ]);
  const variants = orderVariantChoices(selectedProducts.flatMap(({ data }) => data ?? []));

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
      <OrderAmountFields />
      <OrderPreview variants={variants} />
    </>
  );
}

function OrderAmountFields() {
  const { register } = useFormContext<CreateOrderValues>();
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
              {...register(name, { setValueAs: (value: string) => value.trim() || undefined })}
            />
          )}
        </FormField>
      ))}
    </div>
  );
}

function OrderPreview({ variants }: { variants: Record<string, VariantChoice> }) {
  const [areaId, items, override, discount, advance] = useWatch<
    CreateOrderValues,
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
  const quote = useOrderDelivery(areaId);
  const charge = moneyInputOr(override, quote.data?.chargePoisha);
  const orderDiscount = moneyInputOr(discount, 0);
  const paid = moneyInputOr(advance, 0);
  if (orderDiscount === undefined) return null;
  const subtotal = items.reduce((sum, item) => {
    const variant = variants[item.variantId];
    return variant && Number.isSafeInteger(item.quantity) && item.quantity > 0
      ? sum + variant.price * item.quantity
      : NaN;
  }, 0);
  if (!Number.isSafeInteger(subtotal)) return null;
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

function moneyInputOr(value: string | undefined, fallback?: number) {
  return value ? takaInput.safeParse(value).data : fallback;
}
