import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import {
  couriers,
  orderListQuerySchema,
  orderSources,
  type OrderListQuery,
} from '@dakly/contracts/orders';
import { Button } from '@dakly/ui/button';
import { Input } from '@dakly/ui/input';

import { ordersSearch } from '../api/orders';
import { courierLabels } from '../order-labels';

export function OrderFilters({ query }: { query: OrderListQuery }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const { source, courier, createdFrom, createdThrough, ...other } = query;
  const filter = Boolean(source || courier || createdFrom || createdThrough);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const entries = Object.fromEntries(new FormData(event.currentTarget));
    const parsed = orderListQuerySchema.safeParse({
      ...other,
      ...Object.fromEntries(Object.entries(entries).filter(([, value]) => value)),
      cursor: undefined,
    });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Check the filters.');
    setError('');
    router.push(`/orders?${ordersSearch(parsed.data)}`);
  }

  return (
    <details className="rounded-md border border-border bg-surface px-3" open={filter || undefined}>
      <summary className="min-h-10 w-fit cursor-pointer py-2 font-medium">Filters</summary>
      <form
        key={ordersSearch({ source, courier, createdFrom, createdThrough })}
        className="space-y-3 pb-3"
        onSubmit={submit}
      >
        <FilterFields query={query} />
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit">Apply filters</Button>
          {filter && (
            <Button
              variant="secondary"
              onClick={() => {
                setError('');
                router.push(`/orders?${ordersSearch({ ...other, cursor: undefined })}`);
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      </form>
    </details>
  );
}

function FilterFields({ query }: { query: OrderListQuery }) {
  const { source, courier, createdFrom, createdThrough } = query;
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      <OrderFilterSelect name="source" label="Source" value={source}>
        {orderSources.map((value) => (
          <option key={value} value={value}>
            {value.replaceAll('_', ' ')}
          </option>
        ))}
      </OrderFilterSelect>
      <OrderFilterSelect name="courier" label="Courier" value={courier}>
        {couriers.map((value) => (
          <option key={value} value={value}>
            {courierLabels[value]}
          </option>
        ))}
      </OrderFilterSelect>
      <label>
        From date <Input name="createdFrom" type="date" defaultValue={createdFrom} />
      </label>
      <label>
        Through date <Input name="createdThrough" type="date" defaultValue={createdThrough} />
      </label>
    </div>
  );
}

function OrderFilterSelect({
  name,
  label,
  value,
  children,
}: {
  name: 'source' | 'courier';
  label: string;
  value?: string;
  children: React.ReactNode;
}) {
  return (
    <label>
      {label}
      <select
        name={name}
        defaultValue={value ?? ''}
        className="block min-h-10 w-full rounded-md border border-input-border bg-surface px-2"
      >
        <option value="">All</option>
        {children}
      </select>
    </label>
  );
}
