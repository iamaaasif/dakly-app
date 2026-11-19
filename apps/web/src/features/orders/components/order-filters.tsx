import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useRef, useTransition, type ReactNode } from 'react';
import { Controller, FormProvider, useForm, useFormContext } from 'react-hook-form';
import { z } from 'zod';

import {
  couriers,
  orderListQuerySchema,
  orderSources,
  type OrderListQuery,
} from '@dakly/contracts/orders';
import { Button } from '@dakly/ui/button';
import { Checkbox } from '@dakly/ui/checkbox';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';

import { ordersSearch } from '../api/orders';
import { courierLabels, orderSourceLabels } from '../order-labels';

const filterFormSchema = orderListQuerySchema.safeExtend({ onlyCancelled: z.boolean() });
type FilterFormValues = z.input<typeof filterFormSchema>;
type FilterFormInput = z.output<typeof filterFormSchema>;

export type OrderFiltersProps = { query: OrderListQuery };

export function OrderFilters({ query }: OrderFiltersProps) {
  const summary = useRef<HTMLElement>(null);
  const applied = hasOrderFilters(query);

  return (
    <details
      className="rounded-md border border-border bg-surface px-3"
      open={applied || undefined}
    >
      <summary ref={summary} className="min-h-11 w-fit cursor-pointer py-2 font-medium sm:min-h-10">
        Filters
      </summary>
      <FilterForm query={query} applied={applied} focusSummary={() => summary.current?.focus()} />
    </details>
  );
}

function hasOrderFilters({ source, courier, createdFrom, createdThrough, stage }: OrderListQuery) {
  return Boolean(source || courier || createdFrom || createdThrough || stage === 'cancelled');
}

type FilterFormProps = {
  query: OrderListQuery;
  applied: boolean;
  focusSummary: () => void;
};

function FilterForm({ query, applied, focusSummary }: FilterFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { source, courier, createdFrom, createdThrough, ...other } = query;
  const onlyCancelled = query.stage === 'cancelled';
  const base = {
    ...other,
    stage: onlyCancelled ? ('to_confirm' as const) : other.stage,
    cursor: undefined,
  };
  const form = useForm<FilterFormValues, undefined, FilterFormInput>({
    resolver: zodResolver(filterFormSchema),
    values: { source, courier, createdFrom, createdThrough, onlyCancelled },
  });
  const navigate = (next: OrderListQuery) => {
    if (applied && !hasOrderFilters(next)) focusSummary();
    startTransition(() => router.push(`/orders?${ordersSearch(next)}`));
  };
  const submit = form.handleSubmit(
    ({ source, courier, createdFrom, createdThrough, onlyCancelled }) => {
      if (pending) return;
      navigate({
        ...base,
        source,
        courier,
        createdFrom,
        createdThrough,
        ...(onlyCancelled && { stage: 'cancelled', alert: undefined }),
      });
    },
  );

  return (
    <FormProvider {...form}>
      <form className="space-y-3 pb-3" onSubmit={submit}>
        <FilterFields />
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            aria-busy={pending}
            aria-disabled={pending}
            className="min-h-11 sm:min-h-10"
          >
            {pending ? 'Applying filters…' : 'Apply filters'}
          </Button>
          {applied && (
            <Button
              variant="secondary"
              disabled={pending}
              className="min-h-11 sm:min-h-10"
              onClick={() => navigate(base)}
            >
              Clear filters
            </Button>
          )}
        </div>
      </form>
    </FormProvider>
  );
}

function FilterFields() {
  const { control, register } = useFormContext<FilterFormValues>();
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      <OrderFilterSelect name="source" label="Source">
        {orderSources.map((value) => (
          <option key={value} value={value}>
            {orderSourceLabels[value]}
          </option>
        ))}
      </OrderFilterSelect>
      <OrderFilterSelect name="courier" label="Courier">
        {couriers.map((value) => (
          <option key={value} value={value}>
            {courierLabels[value]}
          </option>
        ))}
      </OrderFilterSelect>
      <FormField name="createdFrom" label="From date">
        {(props) => (
          <Input
            {...props}
            type="date"
            {...register('createdFrom', { setValueAs: emptyAsUndefined })}
          />
        )}
      </FormField>
      <FormField name="createdThrough" label="Through date">
        {(props) => (
          <Input
            {...props}
            type="date"
            {...register('createdThrough', { setValueAs: emptyAsUndefined })}
          />
        )}
      </FormField>
      <Controller
        control={control}
        name="onlyCancelled"
        render={({ field }) => (
          <div className="flex min-h-10 items-center gap-3 pl-2 sm:col-span-2 xl:col-span-4">
            <Checkbox
              id={field.name}
              checked={field.value}
              onCheckedChange={(value) => field.onChange(value === true)}
              ref={field.ref}
            />
            <label htmlFor={field.name}>Only cancelled orders</label>
          </div>
        )}
      />
    </div>
  );
}

function emptyAsUndefined(value: string) {
  return value || undefined;
}

type OrderFilterSelectProps = {
  name: 'source' | 'courier';
  label: string;
  children: ReactNode;
};

function OrderFilterSelect({ name, label, children }: OrderFilterSelectProps) {
  const { register } = useFormContext<FilterFormValues>();
  return (
    <FormField name={name} label={label}>
      {(props) => (
        <select
          {...props}
          {...register(name, { setValueAs: emptyAsUndefined })}
          className="min-h-11 w-full min-w-0 rounded-md border border-input-border bg-surface px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-invalid:border-danger sm:min-h-10"
        >
          <option value="">All</option>
          {children}
        </select>
      )}
    </FormField>
  );
}
