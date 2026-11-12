'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { type CreateCustomerInput, createCustomerSchema } from '@dakly/contracts/customers';
import { useCreateCustomer } from '../api/create-customer';

// The form uses the same zod schema as the API, so each rule is written once.
export function NewCustomerForm() {
  const { register, handleSubmit, reset, formState } = useForm<CreateCustomerInput>({
    resolver: zodResolver(createCustomerSchema),
  });
  const createCustomer = useCreateCustomer();

  const onSubmit = handleSubmit((input) =>
    createCustomer.mutate(input, { onSuccess: () => reset() }),
  );

  return (
    <form onSubmit={onSubmit}>
      <label>
        Name
        <input {...register('name')} />
      </label>
      {formState.errors.name && <p role="alert">{formState.errors.name.message}</p>}
      <label>
        Phone
        <input {...register('phone')} inputMode="tel" placeholder="01XXXXXXXXX" />
      </label>
      {formState.errors.phone && <p role="alert">{formState.errors.phone.message}</p>}
      {createCustomer.error && <p role="alert">{createCustomer.error.message}</p>}
      <button type="submit" disabled={createCustomer.isPending}>
        Add customer
      </button>
    </form>
  );
}
