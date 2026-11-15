import { useId } from 'react';
import type { FieldErrors, UseFormRegister } from 'react-hook-form';

import type { CreateCustomerInput } from '@dakly/contracts/customers';
import { Input } from '@dakly/ui/input';

type NewCustomerFieldsProps = {
  register: UseFormRegister<CreateCustomerInput>;
  errors: FieldErrors<CreateCustomerInput>;
};

export function NewCustomerFields({ register, errors }: NewCustomerFieldsProps) {
  const formId = useId();
  return (
    <>
      <label className="grid gap-2 font-medium">
        Name
        <Input
          {...register('name')}
          autoComplete="name"
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? `${formId}-name-error` : undefined}
        />
      </label>
      {errors.name && (
        <p id={`${formId}-name-error`} role="alert" className="text-danger">
          Enter a customer name, up to 120 characters.
        </p>
      )}
      <label className="grid gap-2 font-medium">
        Phone
        <Input
          {...register('phone')}
          type="tel"
          autoComplete="tel"
          placeholder="01712345678"
          aria-invalid={Boolean(errors.phone)}
          aria-describedby={errors.phone ? `${formId}-phone-error` : undefined}
        />
      </label>
      {errors.phone && (
        <p id={`${formId}-phone-error`} role="alert" className="text-danger">
          {errors.phone.message}
        </p>
      )}
    </>
  );
}
