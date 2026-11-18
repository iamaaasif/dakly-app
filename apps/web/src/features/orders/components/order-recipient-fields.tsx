import { useFormContext, useWatch } from 'react-hook-form';

import type { OrderDetail, OrderEditorValues } from '@dakly/contracts/orders';
import { bdMobileSchema } from '@dakly/contracts/phone';
import { Checkbox } from '@dakly/ui/checkbox';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';

import { useOrderDelivery } from '../api/get-delivery-charge';
import { OrderAreaFields } from './order-area-fields';
import { OrderBuyerFields } from './order-buyer-fields';

export function OrderRecipientFields({ order }: { order?: OrderDetail }) {
  const { register } = useFormContext<OrderEditorValues>();

  return (
    <fieldset className="space-y-2">
      <legend className="font-semibold">Buyer and delivery details</legend>
      {order ? <EditBuyerDetails order={order} /> : <OrderBuyerFields />}
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
                placeholder={order?.recipientPhone}
                {...register('recipient.phone', {
                  setValueAs: (value: string) => value.trim() || undefined,
                })}
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
      <DeliveryChargeFields order={order} />
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
  const { chargePoisha: charge, error } = useOrderDelivery(areaId, order);
  return (
    <>
      <div className="grid gap-2 sm:grid-cols-3">
        <OrderAreaFields
          currentDistrict={order?.recipientDistrict}
          onChange={(id) =>
            setValue('recipient.areaId', id ?? (order ? undefined : 0), {
              shouldDirty: true,
              shouldValidate: formState.isSubmitted,
            })
          }
        />
        <FormField name="deliveryChargePoisha" label="Delivery charge (৳)">
          {(props) => (
            <Input
              {...props}
              inputMode="decimal"
              placeholder={charge === undefined ? 'Choose an area' : String(charge / 100)}
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
