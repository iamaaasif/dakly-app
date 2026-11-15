'use client';
import { formatPhone } from '@/lib/format-phone';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createCustomerSchema, type CreateCustomerInput } from '@dakly/contracts/customers';
import { Button } from '@dakly/ui/button';
import { Input } from '@dakly/ui/input';
import { Card } from '@dakly/ui/card';
import { useSupportCustomer, useSupportCreate } from '../api/support';

type SupportCustomersProps = { writable: boolean; contextTag: string };

export function SupportCustomers({ writable, contextTag }: SupportCustomersProps) {
  const [id, setId] = useState('');
  const [selected, setSelected] = useState('');
  const customer = useSupportCustomer(selected, contextTag);
  const create = useSupportCreate(contextTag);
  const form = useForm<CreateCustomerInput>({ resolver: zodResolver(createCustomerSchema) });
  return (
    <>
      <Card>
        <h2 className="text-lg font-semibold">Read customer</h2>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setSelected(id);
          }}
        >
          <label htmlFor="customer-id">Customer ID supplied by the shop</label>
          <Input id="customer-id" value={id} onChange={(e) => setId(e.target.value)} required />
          <Button type="submit">Read customer</Button>
        </form>
        {customer.isFetching ? <p role="status">Loading customer…</p> : null}
        {customer.error ? <p role="alert">{customer.error.message}</p> : null}
        {customer.data ? (
          <p>
            {customer.data.name} · {formatPhone(customer.data.phone)}
          </p>
        ) : null}
      </Card>
      {writable ? (
        <Card>
          <h2 className="text-lg font-semibold">Create customer</h2>
          <form className="space-y-3" onSubmit={form.handleSubmit((input) => create.mutate(input))}>
            <label htmlFor="customer-name">Name</label>
            <Input id="customer-name" {...form.register('name')} />
            <label htmlFor="customer-phone">Phone</label>
            <Input id="customer-phone" {...form.register('phone')} />
            {Object.entries(form.formState.errors).map(([key, error]) => (
              <p role="alert" key={key}>
                {error.message}
              </p>
            ))}
            <Button type="submit" loading={create.isPending}>
              Create customer
            </Button>
            {create.error ? <p role="alert">{create.error.message}</p> : null}
            {create.data ? <p role="status">Customer created: {create.data.id}</p> : null}
          </form>
        </Card>
      ) : (
        <p>Read-only access cannot create customers.</p>
      )}
    </>
  );
}
