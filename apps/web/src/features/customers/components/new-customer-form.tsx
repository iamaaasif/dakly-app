'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { type CreateCustomerInput, createCustomerSchema } from '@dakly/contracts/customers';
import { Badge } from '@dakly/ui/badge';
import { Button } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';

import { useCreateCustomer } from '../api/create-customer';
import { NewCustomerFields } from './new-customer-fields';

export function NewCustomerForm() {
  const { register, handleSubmit, reset, formState } = useForm<CreateCustomerInput>({
    resolver: zodResolver(createCustomerSchema),
  });
  const createCustomer = useCreateCustomer();

  const onSubmit = handleSubmit((input) =>
    createCustomer.mutate(input, { onSuccess: () => reset() }),
  );

  return (
    <Card>
      <h2 className="mb-6 text-md font-semibold">Add customer</h2>
      <form onSubmit={onSubmit} className="space-y-4">
        <NewCustomerFields register={register} errors={formState.errors} />
        {createCustomer.error && (
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
