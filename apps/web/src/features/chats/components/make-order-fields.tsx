'use client';
import { useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

import { formatMoney } from '@dakly/contracts/money';
import type { CreateConversationOrderValues, OrderCatalogueProduct } from '@dakly/contracts/orders';
import { Checkbox } from '@dakly/ui/checkbox';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';

import { MakeOrderProduct } from './make-order-product';
import { OrderAreaFields } from '@/components/order-area-fields';
import { takaInputFromPoisha } from '@/lib/format-money';
import { useOrderDelivery } from '@/lib/order-entry/get-delivery-charge';

type Variant = OrderCatalogueProduct['variants'][number];

export function MakeOrderFields() {
  const { register, setValue, control, formState } =
    useFormContext<CreateConversationOrderValues>();
  const [variant, setVariant] = useState<Variant | undefined>();
  const areaId = useWatch({ control, name: 'recipient.areaId' });
  const quantity = useWatch({ control, name: 'items.0.quantity' });
  const { chargePoisha } = useOrderDelivery(areaId || undefined);
  const subtotal = variant ? variant.pricePoisha * (Number(quantity) || 0) : 0;
  return (
    <>
      <MakeOrderProduct onPick={setVariant} />
      <FormField name="recipient.name" label="Name">
        {(props) => (
          <Input
            {...props}
            className="text-sm"
            placeholder="Customer name"
            {...register('recipient.name')}
          />
        )}
      </FormField>
      <FormField name="recipient.phone" label="Phone">
        {(props) => (
          <Input
            {...props}
            type="tel"
            className="text-sm"
            autoComplete="tel-national"
            placeholder="01712-345678"
            {...register('recipient.phone')}
          />
        )}
      </FormField>
      <FormField name="recipient.address" label="Address">
        {(props) => (
          <Input
            {...props}
            className="text-sm"
            placeholder="House, road, area"
            {...register('recipient.address')}
          />
        )}
      </FormField>
      <OrderAreaFields
        onChange={(id) =>
          setValue('recipient.areaId', id ?? 0, { shouldValidate: formState.isSubmitted })
        }
      />
      <PaidInAdvance chargePoisha={chargePoisha} />
      <OrderTotals subtotal={subtotal} chargePoisha={chargePoisha} />
    </>
  );
}

function OrderTotals({
  subtotal,
  chargePoisha,
}: {
  subtotal: number;
  chargePoisha: number | undefined;
}) {
  const { control } = useFormContext<CreateConversationOrderValues>();
  const advance = useWatch({ control, name: 'advancePaidPoisha' });
  // A delivery charge paid in advance is not collected again at the door.
  const paidAhead = Boolean(advance) && advance !== '0';
  return (
    <dl className="space-y-1 rounded-md bg-surface-muted p-3 text-sm">
      <Row label="Product" value={formatMoney(subtotal)} />
      <Row
        label="Delivery"
        value={chargePoisha === undefined ? 'Choose a district' : formatMoney(chargePoisha)}
      />
      <Row
        label="Cash on delivery"
        value={formatMoney(subtotal + (paidAhead ? 0 : (chargePoisha ?? 0)))}
        strong
      />
    </dl>
  );
}

function PaidInAdvance({ chargePoisha }: { chargePoisha: number | undefined }) {
  const { setValue, control } = useFormContext<CreateConversationOrderValues>();
  const advance = useWatch({ control, name: 'advancePaidPoisha' });
  return (
    <div className="flex min-h-10 items-center gap-2">
      <Checkbox
        id="delivery-paid-in-advance"
        disabled={chargePoisha === undefined}
        checked={Boolean(advance) && advance !== '0'}
        onCheckedChange={(checked) =>
          setValue(
            'advancePaidPoisha',
            checked === true && chargePoisha !== undefined
              ? takaInputFromPoisha(chargePoisha)
              : '0',
          )
        }
      />
      <label htmlFor="delivery-paid-in-advance">Delivery charge paid in advance</label>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${strong ? 'font-semibold' : ''}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
