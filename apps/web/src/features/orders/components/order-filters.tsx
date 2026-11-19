import { zodResolver } from '@hookform/resolvers/zod';
import { SlidersHorizontal } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState, useTransition, type ReactNode } from 'react';
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
import { OrderSearch } from './order-search';

const filterFormSchema = orderListQuerySchema.safeExtend({ onlyCancelled: z.boolean() });
type FilterFormValues = z.input<typeof filterFormSchema>;
type FilterFormInput = z.output<typeof filterFormSchema>;

export type OrderFiltersProps = { query: OrderListQuery };

export function OrderFilters({ query }: OrderFiltersProps) {
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const applied = hasOrderFilters(query);
  const [panel, setPanel] = useState({ applied, expanded: applied });
  if (panel.applied !== applied) setPanel({ applied, expanded: applied });
  const { expanded } = panel;

  function closeFilters() {
    setPanel({ applied, expanded: false });
    trigger.current?.focus();
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <OrderSearch query={query} />
        <Button
          ref={trigger}
          variant="secondary"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setPanel({ applied, expanded: !expanded })}
        >
          <SlidersHorizontal aria-hidden="true" size={16} strokeWidth={1.75} />
          Filters
        </Button>
      </div>
      <div
        hidden={!expanded}
        id={panelId}
        className="rounded-lg border border-border bg-surface p-3"
      >
        <FilterForm query={query} applied={applied} closeFilters={closeFilters} />
      </div>
    </div>
  );
}

function hasOrderFilters({ source, courier, createdFrom, createdThrough, stage }: OrderListQuery) {
  return Boolean(source || courier || createdFrom || createdThrough || stage === 'cancelled');
}

type FilterFormProps = {
  query: OrderListQuery;
  applied: boolean;
  closeFilters: () => void;
};

function FilterForm({ query, applied, closeFilters }: FilterFormProps) {
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
    if (applied && !hasOrderFilters(next)) closeFilters();
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
      <form className="space-y-3" onSubmit={submit}>
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
