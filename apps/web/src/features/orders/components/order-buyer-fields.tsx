import { useFormContext } from 'react-hook-form';

import type { CreateOrderValues } from '@dakly/contracts/orders';

import { FormField } from '@/components/form-field';

export function OrderBuyerFields() {
  const { getValues, register, setValue, formState } = useFormContext<CreateOrderValues>();
  function fillRecipient(key: 'name' | 'phone', value: string) {
    const recipient = getValues('recipient');
    if (recipient.isBuyer && !recipient[key]) setValue(`recipient.${key}`, value);
  }
  return (
    <fieldset className="space-y-2">
      <legend className="font-semibold">Buyer</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        <FormField
          label="Buyer name"
          autoComplete="name"
          field={register('buyer.name', {
            onBlur: (event) => fillRecipient('name', String(event.target.value)),
          })}
        />
        <FormField
          label="Buyer phone (optional)"
          type="tel"
          field={register('buyer.phone', {
            setValueAs: (value: string) => value.trim() || undefined,
            onBlur: (event) => fillRecipient('phone', String(event.target.value)),
          })}
        />
      </div>
      {formState.errors.buyer && (
        <p role="alert" className="text-danger">
          Check the buyer name and phone.
        </p>
      )}
    </fieldset>
  );
}
