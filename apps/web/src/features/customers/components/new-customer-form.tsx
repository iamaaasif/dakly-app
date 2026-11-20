'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { type CreateContactInput, createContactSchema } from '@dakly/contracts/contacts';
import { Button } from '@dakly/ui/button';

import { useCreateCustomer } from '../api/create-customer';
import { isPhoneTaken } from '../customer-errors';
import { NewCustomerFields } from './new-customer-fields';

type NewCustomerFormProps = {
  onDone: (success?: boolean) => void;
};

export function NewCustomerForm({ onDone }: NewCustomerFormProps) {
  const { register, handleSubmit, reset, setError, formState } = useForm<CreateContactInput>({
    resolver: zodResolver(createContactSchema),
  });
  const createCustomer = useCreateCustomer();

  const onSubmit = handleSubmit((input) =>
    createCustomer.mutate(input, {
      onSuccess: () => {
        reset();
        onDone(true);
      },
      onError: (error) => {
        if (isPhoneTaken(error)) setError('phone', { message: error.message });
      },
    }),
  );

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <NewCustomerFields register={register} errors={formState.errors} />
      {createCustomer.error && !isPhoneTaken(createCustomer.error) && (
        <p role="alert" className="text-danger">
          {createCustomer.error.message}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={() => onDone(false)}>
          Cancel
        </Button>
        <Button type="submit" loading={createCustomer.isPending}>
          Add customer
        </Button>
      </div>
    </form>
  );
}
