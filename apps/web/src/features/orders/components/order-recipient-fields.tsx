import { useFormContext, useWatch } from 'react-hook-form';

import { formatMoney } from '@dakly/contracts/money';
import type { OrderDetail, OrderEditorValues } from '@dakly/contracts/orders';
import { bdMobileSchema } from '@dakly/contracts/phone';
import { ApiError } from '@dakly/ui/api-client';
import { Button } from '@dakly/ui/button';
import { Checkbox } from '@dakly/ui/checkbox';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';

import { useSetupDeliveryZones } from '../api/setup-delivery-zones';
import { OrderBuyerFields } from './order-buyer-fields';
import { OrderAreaFields } from '@/components/order-area-fields';
import { takaInputFromPoisha } from '@/lib/format-money';
import { useOrderDelivery } from '@/lib/order-entry/get-delivery-charge';
import { useSessionContext } from '@/lib/session-context';

export function OrderRecipientFields({ order }: { order?: OrderDetail }) {
  const { control, register } = useFormContext<OrderEditorValues>();
  const isBuyer = useWatch({ control, name: 'recipient.isBuyer' });
  const separateRecipient = Boolean(order) || isBuyer === false;

  return (
    <fieldset className="space-y-2">
      <legend className={order ? 'font-semibold' : 'sr-only'}>Buyer and delivery details</legend>
      {order && <EditBuyerDetails order={order} />}
      <div className="grid gap-2 sm:grid-cols-2">
        <FormField name="recipient.phone" label={separateRecipient ? 'Recipient phone' : 'Phone'}>
          {(props) => (
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="text-text-muted">
                +880
              </span>
              <Input
                {...props}
                type="tel"
                autoComplete="tel-national"
                placeholder={order?.recipientPhone ?? undefined}
                {...register('recipient.phone', {
                  setValueAs: (value: string) => value.trim() || undefined,
                })}
              />
            </div>
          )}
        </FormField>
        <FormField name="recipient.name" label={separateRecipient ? 'Recipient name' : 'Name'}>
          {(props) => <Input {...props} {...register('recipient.name')} />}
        </FormField>
        <div className="sm:col-span-2">
          <FormField name="recipient.address" label="Address">
            {(props) => (
              <Input
                {...props}
                placeholder={order ? undefined : 'House, road, landmark'}
                {...register('recipient.address')}
              />
            )}
          </FormField>
        </div>
      </div>
      <DeliveryChargeFields order={order} />
      {!order && <OrderBuyerFields />}
    </fieldset>
  );
}

function EditBuyerDetails({ order }: { order: OrderDetail }) {
  const { control, setValue } = useFormContext<OrderEditorValues>();
  const isBuyer = useWatch({ control, name: 'recipient.isBuyer' });
  return (
    <>
      <p>
        Buyer <strong>{order.buyerName ?? 'Unnamed customer'}</strong>
      </p>
      <div className="flex min-h-10 items-center gap-3 pl-2">
        <Checkbox
          id="different-recipient"
          checked={isBuyer === false}
          onCheckedChange={(value) => {
            const next = value !== true;
            const original = next === order.isRecipientBuyer;
            setValue('recipient.isBuyer', next, { shouldDirty: true });
            const name = next ? (order.buyerName ?? '') : '';
            setValue('recipient.name', original ? order.recipientName : name, {
              shouldDirty: true,
            });
            setValue(
              'recipient.phone',
              original ? bdMobileSchema.safeParse(order.recipientPhone).data : '',
              { shouldDirty: true },
            );
          }}
        />
        <label htmlFor="different-recipient">Deliver to someone else</label>
      </div>
    </>
  );
}

function DeliveryChargeFields({ order }: { order?: OrderDetail }) {
  const { control, register, setValue, formState } = useFormContext<OrderEditorValues>();
  const areaId = useWatch({ control, name: 'recipient.areaId' });
  const { chargePoisha: charge, error, refetch } = useOrderDelivery(areaId, order);
  const missingZones = error instanceof ApiError && error.code === 'DELIVERY_DEFAULT_REQUIRED';
  return (
    <>
      <div
        className={order ? 'grid gap-2 sm:grid-cols-3' : 'grid grid-cols-2 gap-2 sm:grid-cols-4'}
      >
        <OrderAreaFields
          currentDistrict={order?.recipientDistrict ?? undefined}
          onChange={(id) =>
            setValue('recipient.areaId', id ?? (order ? undefined : 0), {
              shouldDirty: true,
              shouldValidate: formState.isSubmitted,
            })
          }
        />
        <FormField
          name="deliveryChargePoisha"
          label={order ? 'Delivery charge (৳)' : 'Delivery (৳)'}
        >
          {(props) => (
            <Input
              {...props}
              inputMode="decimal"
              placeholder={charge === undefined ? 'Choose an area' : takaInputFromPoisha(charge)}
              {...register('deliveryChargePoisha', {
                setValueAs: (value: string) => value.trim() || undefined,
              })}
            />
          )}
        </FormField>
      </div>
      <ChargeHint chargePoisha={charge} />
      {missingZones && <SetupDeliveryZones retryQuote={() => void refetch()} />}
      {error && !missingZones && (
        <p role="alert" className="text-danger">
          {error.message}
        </p>
      )}
    </>
  );
}

function ChargeHint({ chargePoisha }: { chargePoisha?: number }) {
  const { control } = useFormContext<OrderEditorValues>();
  const typed = useWatch({ control, name: 'deliveryChargePoisha' });
  if (chargePoisha === undefined || typed) return null;
  return (
    <p className="text-text-muted">
      Delivery for this area is {formatMoney(chargePoisha)}. Type a charge to change it.
    </p>
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
