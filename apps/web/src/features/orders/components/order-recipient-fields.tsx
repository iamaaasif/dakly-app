import { useFormContext, useWatch } from 'react-hook-form';

import type { CreateOrderValues } from '@dakly/contracts/orders';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';

import { useOrderDelivery } from '../api/get-delivery-charge';
import { poishaInput } from '../order-money';
import { OrderAreaFields } from './order-area-fields';

export function OrderRecipientFields() {
  const { control, register, setValue } = useFormContext<CreateOrderValues>();
  const recipient = useWatch({ control, name: 'recipient' });
  const quote = useOrderDelivery(recipient.areaId);
  const charge = quote.data?.chargePoisha;

  return (
    <fieldset className="space-y-2">
      <legend className="font-semibold">Delivery details</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        <FormField name="recipient.phone" label="Recipient phone">
          {(props) => <Input {...props} type="tel" {...register('recipient.phone')} />}
        </FormField>
        <FormField name="recipient.name" label="Recipient name">
          {(props) => <Input {...props} {...register('recipient.name')} />}
        </FormField>
        <div className="sm:col-span-2">
          <FormField name="recipient.address" label="Address">
            {(props) => <Input {...props} {...register('recipient.address')} />}
          </FormField>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <OrderAreaFields
          onChange={(id) => setValue('recipient.areaId', id ?? 0, { shouldValidate: true })}
        />
        <FormField name="deliveryChargePoisha" label="Delivery charge (৳)">
          {(props) => (
            <Input
              {...props}
              inputMode="decimal"
              placeholder={charge === undefined ? 'Choose an area' : String(charge / 100)}
              {...register('deliveryChargePoisha', { setValueAs: poishaInput })}
            />
          )}
        </FormField>
      </div>
      {quote.error && (
        <p role="alert" className="text-danger">
          {quote.error.message}
        </p>
      )}
    </fieldset>
  );
}
