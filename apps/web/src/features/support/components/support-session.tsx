'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { createCustomerSchema, type CreateCustomerInput } from '@dakly/contracts/customers';
import { Button } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';
import { Input } from '@dakly/ui/input';

import { useSupportSession, useSupportCustomer, useSupportCreate } from '../api/support';
import { formatDateTime } from '@/lib/format-date';
import { formatPhone } from '@/lib/format-phone';

export function SupportSession() {
  const session = useSupportSession();
  return (
    <main className="mx-auto max-w-2xl space-y-5 p-4">
      <h1 className="text-xl font-semibold">Support session</h1>
      {session.isPending ? <p role="status">Checking support access…</p> : null}
      {session.error ? (
        <p role="alert">
          Access ended by the Owner, expired, or your staff session ended. Return to the staff app
          to continue.
        </p>
      ) : null}
      {session.data && !session.error ? (
        <>
          <section
            role="status"
            aria-label="Active Dakly support access"
            className="space-y-2 rounded-md bg-danger p-4 text-on-primary"
          >
            <p className="font-semibold">
              {session.data.isBreakGlass ? 'Dakly break-glass access' : 'Dakly support'} (
              {session.data.staffName})
            </p>
            {session.data.isBreakGlass ? (
              <p>Emergency read-only access. No Owner approval was requested.</p>
            ) : null}
            <p>{session.data.storeName}</p>
            <p>{session.data.access === 'write' ? 'Read and write' : 'Read only'} · Customers</p>
            <p>Access expires {formatDateTime(session.data.expiresAt!)}</p>
            <p>The Owner can end this session at any time.</p>
          </section>
          <SupportCustomers
            key={session.data.contextTag}
            contextTag={session.data.contextTag}
            writable={session.data.access === 'write'}
          />
        </>
      ) : null}
    </main>
  );
}
function SupportCustomers({ writable, contextTag }: { writable: boolean; contextTag: string }) {
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
