'use client';
import type { ReactNode } from 'react';
import { Controller, useFormContext } from 'react-hook-form';

import type { CreateOrderValues } from '@dakly/contracts/orders';
import { ApiError } from '@dakly/ui/api-client';
import { Checkbox } from '@dakly/ui/checkbox';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';
import { Textarea } from '@dakly/ui/textarea';

import { BdtPrefix, OrderCard } from '../new-order-fields';
import { SetupDeliveryZones } from './order-recipient-fields';
import { takaInputFromPoisha } from '@/lib/format-money';

// The API takes no note at all, not an empty one.
const blankToUndefined = (value: string) => value.trim() || undefined;

type MoneyName = 'deliveryChargePoisha' | 'orderDiscountPoisha' | 'advancePaidPoisha';

function MoneyField({
  name,
  label,
  placeholder,
}: {
  name: MoneyName;
  label: string;
  placeholder?: string;
}) {
  const { register } = useFormContext<CreateOrderValues>();
  return (
    <FormField name={name} label={label}>
      {(props) => (
        <BdtPrefix>
          <Input
            {...props}
            inputMode="decimal"
            placeholder={placeholder ?? '0.00'}
            className="min-h-0 border-0 bg-transparent p-0 focus-visible:outline-none"
            {...register(name, { setValueAs: (value: string) => value.trim() || undefined })}
          />
        </BdtPrefix>
      )}
    </FormField>
  );
}

type OrderPaymentCardProps = {
  quotePoisha: number | undefined;
  quoteError: Error | null;
  onRetryQuote: () => void;
};

export function OrderPaymentCard({ quotePoisha, quoteError, onRetryQuote }: OrderPaymentCardProps) {
  const missingZones =
    quoteError instanceof ApiError && quoteError.code === 'DELIVERY_DEFAULT_REQUIRED';
  return (
    <OrderCard title="Payment">
      <div className="grid gap-4 sm:grid-cols-2">
        <ReadOnlyField label="Payment">Cash on delivery</ReadOnlyField>
        <MoneyField
          name="deliveryChargePoisha"
          label="Delivery charge"
          placeholder={
            quotePoisha === undefined ? 'Choose an area' : takaInputFromPoisha(quotePoisha)
          }
        />
        <MoneyField name="advancePaidPoisha" label="Advance payment" />
        <MoneyField name="orderDiscountPoisha" label="Discount" />
      </div>
      <ConfirmNow />
      {missingZones && <SetupDeliveryZones retryQuote={onRetryQuote} />}
      {quoteError && !missingZones && (
        <p role="alert" className="text-sm text-danger">
          {quoteError.message}
        </p>
      )}
    </OrderCard>
  );
}

function ReadOnlyField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-text">{label}</p>
      <p className="flex min-h-10 items-center rounded-md border border-input-border bg-surface-muted px-3 text-text">
        {children}
      </p>
    </div>
  );
}

export function OrderNoteCard() {
  const { register } = useFormContext<CreateOrderValues>();
  return (
    <OrderCard title="Note">
      <FormField name="note" label="Order note">
        {(props) => (
          <Textarea
            {...props}
            maxLength={500}
            placeholder="Write order note here..."
            {...register('note', { setValueAs: blankToUndefined })}
          />
        )}
      </FormField>
      <FormField name="teamNote" label="Team note">
        {(props) => (
          <Textarea
            {...props}
            maxLength={500}
            placeholder="Write team note here..."
            {...register('teamNote', { setValueAs: blankToUndefined })}
          />
        )}
      </FormField>
    </OrderCard>
  );
}

function ConfirmNow() {
  const { control } = useFormContext<CreateOrderValues>();
  return (
    <Controller
      control={control}
      name="confirm"
      render={({ field }) => (
        <div className="flex min-h-10 items-center gap-3">
          <Checkbox
            id="confirm-now"
            checked={field.value === true}
            onCheckedChange={(on) => field.onChange(on === true)}
          />
          <label htmlFor="confirm-now">Confirm now and send it to To pack</label>
        </div>
      )}
    />
  );
}
