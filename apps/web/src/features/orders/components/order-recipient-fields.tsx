import { useFormContext, useWatch } from 'react-hook-form';

import type { CreateOrderValues } from '@dakly/contracts/orders';
import { ApiError } from '@dakly/ui/api-client';
import { Button } from '@dakly/ui/button';
import { Checkbox } from '@dakly/ui/checkbox';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';

import { useOrderDelivery } from '../api/get-delivery-charge';
import { useSetupDeliveryZones } from '../api/setup-delivery-zones';
import { OrderAreaFields } from './order-area-fields';
import { takaInputFromPoisha } from '@/lib/format-money';
import { useSessionContext } from '@/lib/session-context';

export function OrderRecipientFields() {
  const { control, register } = useFormContext<CreateOrderValues>();
  const isBuyer = useWatch({ control, name: 'recipient.isBuyer' });

  return (
    <fieldset className="space-y-2">
      <legend className="font-semibold">Buyer and delivery details</legend>
      <BuyerFields />
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
        {!isBuyer && (
          <FormField name="recipient.name" label="Recipient name">
            {(props) => <Input {...props} {...register('recipient.name')} />}
          </FormField>
        )}
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
  const { data: charge, error, refetch } = useOrderDelivery(areaId);
  const missingZones = error instanceof ApiError && error.code === 'DELIVERY_DEFAULT_REQUIRED';
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
              placeholder={charge ? takaInputFromPoisha(charge.chargePoisha) : 'Choose an area'}
              {...register('deliveryChargePoisha', {
                setValueAs: (value: string) => value.trim() || undefined,
              })}
            />
          )}
        </FormField>
      </div>
      {missingZones && <SetupDeliveryZones retryQuote={() => void refetch()} />}
      {error && !missingZones && (
        <p role="alert" className="text-danger">
          {error.message}
        </p>
      )}
    </>
  );
}

function SetupDeliveryZones({ retryQuote }: { retryQuote: () => void }) {
  const { data } = useSessionContext();
  const setup = useSetupDeliveryZones(retryQuote);
  if (!data?.currentStore?.canEditStoreSettings)
    return <p role="alert">Ask a shop owner to set up delivery zones before taking orders.</p>;
  return (
    <div className="space-y-2">
      <p>Set up delivery zones to get a charge for this address.</p>
      <Button variant="secondary" loading={setup.isPending} onClick={() => setup.mutate()}>
        Set up delivery zones
      </Button>
      {setup.error && (
        <p role="alert" className="text-danger">
          {setup.error.message}
        </p>
      )}
    </div>
  );
}

function BuyerFields() {
  const { control, getValues, register, setValue } = useFormContext<CreateOrderValues>();
  const isBuyer = useWatch({ control, name: 'recipient.isBuyer' });
  return (
    <>
      <FormField name="buyer.name" label="Buyer name">
        {(props) => (
          <Input
            {...props}
            {...register('buyer.name', {
              onChange: (event) => {
                if (getValues('recipient.isBuyer')) setValue('recipient.name', event.target.value);
              },
            })}
          />
        )}
      </FormField>
      <div className="flex min-h-10 items-center gap-3 pl-2">
        <Checkbox
          id="different-recipient"
          checked={!isBuyer}
          onCheckedChange={(different) => {
            setValue('recipient.isBuyer', different !== true);
            setValue('recipient.name', different ? '' : getValues('buyer.name'));
            setValue('recipient.phone', '');
          }}
        />
        <label htmlFor="different-recipient">Deliver to someone else</label>
      </div>
    </>
  );
}
