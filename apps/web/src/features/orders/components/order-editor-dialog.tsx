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

import { useCreateOrder } from '../api/create-order';
import { useOrderDelivery } from '../api/get-delivery-charge';
import {
  OrderProductFields,
  orderVariantChoices,
  type VariantChoice,
} from './order-product-fields';
import { OrderRecipientFields } from './order-recipient-fields';
import { SessionDialog } from '@/components/session-dialog';
import { formatMoney } from '@/lib/format-money';
import { useProductDetails } from '@/lib/product-detail-query';

const newLine = { variantId: '', quantity: 1, lineDiscountPoisha: 0 };

type NewOrderDialogProps = { onClose: () => void; onSaved: (id: string) => void };

export function NewOrderDialog({ onClose, onSaved }: NewOrderDialogProps) {
  const create = useCreateOrder();
  const form = useForm<CreateOrderValues, undefined, CreateOrderInput>({
    resolver: zodResolver(createOrderFormSchema),
    defaultValues: {
      buyer: { name: '' },
      recipient: { name: '', phone: '', address: '', areaId: 0, isBuyer: true },
      items: [newLine],
    },
  });
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
      closeDisabled={create.isPending}
      className="max-h-[calc(100dvh-1rem)] max-w-2xl open:flex open:flex-col"
    >
      <FormProvider {...form}>
        <form className="flex min-h-0 flex-col gap-3" onSubmit={submit}>
          <div className="min-h-0 overflow-y-auto px-0.5">
            <fieldset disabled={create.isPending || create.mustRetry} className="space-y-3">
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
            <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              {create.mustRetry ? 'Retry save' : 'Save order'}
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
  const selectedProducts = useProductDetails([
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
  const delivery = override ? takaInput.safeParse(override).data : quote.data?.chargePoisha;
  if (delivery === undefined) return null;
  const total = items.reduce((sum, item) => {
    const variant = variants[item.variantId];
    return variant && Number.isSafeInteger(item.quantity) && item.quantity > 0
      ? sum + variant.price * item.quantity
      : NaN;
  }, delivery);
  if (!Number.isSafeInteger(total) || total < 0) return null;
  return (
    <p className="rounded-md bg-surface-muted p-3">
      Cash on delivery <strong>{formatMoney(total)}</strong>
    </p>
  );
}
