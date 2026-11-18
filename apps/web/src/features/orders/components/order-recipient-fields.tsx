import { useFormContext, useWatch } from 'react-hook-form';

import type { CreateOrderValues } from '@dakly/contracts/orders';

import { useOrderDelivery } from '../api/get-delivery-charge';
import { poishaInput } from '../order-money';
import { OrderAreaFields } from './order-area-fields';
import { FormField } from '@/components/form-field';

export function OrderRecipientFields() {
  const { control, register, setValue, getValues, formState } = useFormContext<CreateOrderValues>();
  const recipient = useWatch({ control, name: 'recipient' });
  const quote = useOrderDelivery(recipient.areaId);
  const charge = quote.data?.chargePoisha;

  function chooseRecipient(isGift: boolean) {
    setValue('recipient.isBuyer', !isGift);
    const buyer = getValues('buyer');
    const own = !isGift && 'name' in buyer ? buyer : undefined;
    setValue('recipient.name', own?.name ?? '');
    setValue('recipient.phone', own?.phone ?? '');
  }

  return (
    <fieldset className="space-y-2">
      <legend className="font-semibold">Delivery details</legend>
      <label className="flex min-h-10 items-center gap-2">
        <input
          type="checkbox"
          className="accent-action"
          checked={recipient.isBuyer === false}
          onChange={(event) => chooseRecipient(event.target.checked)}
        />
        Deliver to someone else
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <FormField label="Recipient phone" type="tel" field={register('recipient.phone')} />
        <FormField label="Recipient name" field={register('recipient.name')} />
        <div className="sm:col-span-2">
          <FormField label="Address" field={register('recipient.address')} />
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <OrderAreaFields onChange={(id) => setValue('recipient.areaId', id ?? 0)} />
        <FormField
          label="Delivery charge (৳)"
          inputMode="decimal"
          placeholder={charge === undefined ? 'Choose an area' : String(charge / 100)}
          field={register('deliveryChargePoisha', { setValueAs: poishaInput })}
        />
      </div>
      {quote.error && (
        <p role="alert" className="text-danger">
          {quote.error.message}
        </p>
      )}
      {formState.errors.recipient && (
        <p role="alert" className="text-danger">
          Check the recipient name, phone, address and area.
        </p>
      )}
    </fieldset>
  );
}
