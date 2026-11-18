import { useFormContext, useWatch } from 'react-hook-form';

import type { CreateOrderValues } from '@dakly/contracts/orders';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';

import { useOrderDelivery } from '../api/get-delivery-charge';
import { OrderAreaFields } from './order-area-fields';
import { OrderBuyerFields } from './order-buyer-fields';

export function OrderRecipientFields() {
  const { register } = useFormContext<CreateOrderValues>();

  return (
    <fieldset className="space-y-2">
      <legend className="font-semibold">Buyer and delivery details</legend>
      <OrderBuyerFields />
      <div className="grid gap-2 sm:grid-cols-2">
        <FormField name="recipient.phone" label="Recipient phone">
          {(props) => (
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="text-text-muted">
                +880
              </span>
              <Input
                {...props}
                type="tel"
                autoComplete="tel-national"
                {...register('recipient.phone')}
              />
            </div>
          )}
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
      <DeliveryChargeFields />
    </fieldset>
  );
}

function DeliveryChargeFields() {
  const { control, register, setValue, formState } = useFormContext<CreateOrderValues>();
  const areaId = useWatch({ control, name: 'recipient.areaId' });
  const { data: charge, error } = useOrderDelivery(areaId);
  return (
    <>
      <div className="grid gap-2 sm:grid-cols-3">
        <OrderAreaFields
          onChange={(id) =>
            setValue('recipient.areaId', id ?? 0, { shouldValidate: formState.isSubmitted })
          }
        />
        <FormField name="deliveryChargePoisha" label="Delivery charge (৳)">
          {(props) => (
            <Input
              {...props}
              inputMode="decimal"
              placeholder={charge ? String(charge.chargePoisha / 100) : 'Choose an area'}
              {...register('deliveryChargePoisha', {
                setValueAs: (value: string) => value.trim() || undefined,
              })}
            />
          )}
        </FormField>
      </div>
      {error && (
        <p role="alert" className="text-danger">
          {error.message}
        </p>
      )}
    </>
  );
}
