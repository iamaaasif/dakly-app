'use client';
import { useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

import type { CreateOrderValues } from '@dakly/contracts/orders';
import { Checkbox } from '@dakly/ui/checkbox';
import { cn } from '@dakly/ui/cn';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';

import { filledClass, OrderCard } from '../new-order-fields';
import { useCustomerFill } from '../use-customer-fill';
import { OrderAreaPicker } from './order-area-picker';
import { OrderPhoneField } from './order-phone-field';

export function OrderCustomerCard() {
  const form = useFormContext<CreateOrderValues>();
  const fill = useCustomerFill();
  const [picked, setPicked] = useState<string>();
  const { filled, paths, unmark } = fill;
  return (
    <OrderCard title="Customer">
      <div className="grid gap-4 sm:grid-cols-2">
        <OrderPhoneField
          name={paths.phone}
          filled={filled.has('phone')}
          separate={fill.separate}
          picked={picked}
          onPick={setPicked}
          onCustomer={fill.applyCustomer}
          onEdit={() => unmark('phone')}
        />
        <FormField name={paths.name} label="Name">
          {(props) => (
            <Input
              {...props}
              placeholder="Demo Rahim"
              autoComplete="name"
              className={cn(filled.has('name') && filledClass)}
              {...form.register(paths.name, { onChange: () => unmark('name') })}
            />
          )}
        </FormField>
        <div className="sm:col-span-2">
          <FormField name="recipient.address" label="Address">
            {(props) => (
              <Input
                {...props}
                placeholder="House, road, landmark..."
                autoComplete="street-address"
                className={cn(filled.has('address') && filledClass)}
                {...form.register('recipient.address', { onChange: () => unmark('address') })}
              />
            )}
          </FormField>
        </div>
        <OrderAreaPicker
          area={fill.area}
          filled={filled.has('area')}
          invalid={Boolean(form.formState.errors.recipient?.areaId)}
          onChange={(next) => fill.chooseArea(next)}
        />
        <AreaError />
      </div>
      <SeparateRecipient />
    </OrderCard>
  );
}

function AreaError() {
  const { formState } = useFormContext<CreateOrderValues>();
  const error = formState.errors.recipient?.areaId;
  if (!error) return null;
  return (
    <p role="alert" className="text-sm text-danger sm:col-span-2">
      {error.message}
    </p>
  );
}

function SeparateRecipient() {
  const form = useFormContext<CreateOrderValues>();
  const separate = useWatch({ control: form.control, name: 'recipient.isBuyer' }) === false;
  return (
    <div className="space-y-4">
      <div className="flex min-h-10 items-center gap-3">
        <Checkbox
          id="different-recipient"
          checked={separate}
          onCheckedChange={(on) => {
            form.setValue('recipient.isBuyer', on !== true, { shouldDirty: true });
            form.setValue('buyer', { name: '' });
          }}
        />
        <label htmlFor="different-recipient">Deliver to someone else</label>
      </div>
      {separate && (
        <div className="grid gap-4 sm:grid-cols-2">
          <p className="text-sm text-text-muted sm:col-span-2">
            The name and phone above are the buyer. Enter who receives the parcel here.
          </p>
          <FormField name="recipient.name" label="Recipient name">
            {(props) => <Input {...props} {...form.register('recipient.name')} />}
          </FormField>
          <FormField name="recipient.phone" label="Recipient phone">
            {(props) => (
              <Input {...props} type="tel" inputMode="tel" {...form.register('recipient.phone')} />
            )}
          </FormField>
        </div>
      )}
    </div>
  );
}
