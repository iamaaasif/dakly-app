'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { type CreateContactInput, createContactSchema } from '@dakly/contracts/contacts';
import { Badge } from '@dakly/ui/badge';
import { Button } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';

import { useCreateCustomer } from '../api/create-customer';
import { isPhoneTaken } from '../customer-errors';
import { NewCustomerFields } from './new-customer-fields';

export function NewCustomerForm() {
  const { register, handleSubmit, reset, setError, formState } = useForm<CreateContactInput>({
    resolver: zodResolver(createContactSchema),
  });
  const createCustomer = useCreateCustomer();

  const onSubmit = handleSubmit((input) =>
    createCustomer.mutate(input, {
      onSuccess: () => reset(),
      onError: (error) => {
        if (isPhoneTaken(error)) setError('phone', { message: error.message });
      },
    }),
  );

  return (
    <Card>
      <h2 className="mb-6 text-md font-semibold">Add customer</h2>
      <form onSubmit={onSubmit} className="space-y-4">
        <NewCustomerFields register={register} errors={formState.errors} />
        {createCustomer.error && !isPhoneTaken(createCustomer.error) && (
          <p role="alert" className="text-danger">
            {createCustomer.error.message}
          </p>
        )}
        <Button type="submit" loading={createCustomer.isPending}>
          Add customer
        </Button>
        {createCustomer.isSuccess && (
          <p role="status">
            <Badge variant="success">Customer added</Badge>
          </p>
        )}
      </form>
    </Card>
  );
}
