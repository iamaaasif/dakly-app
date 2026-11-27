import { zodResolver } from '@hookform/resolvers/zod';
import { SlidersHorizontal } from 'lucide-react';
import { useRef, useState, useTransition, type ReactNode } from 'react';
import { Controller, FormProvider, useForm, useFormContext } from 'react-hook-form';
import { z } from 'zod';

import { couriers, orderListQuerySchema, type OrderListQuery } from '@dakly/contracts/orders';
import { Button } from '@dakly/ui/button';
import { Checkbox } from '@dakly/ui/checkbox';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@dakly/ui/popover';

import { ordersSearch } from '../api/orders';
import { courierLabels } from '../order-labels';
import type { OrdersNavigationQuery } from '../orders-url';
import { useUrlRouter } from '@/lib/use-url-query';

const filterFormSchema = orderListQuerySchema.safeExtend({ onlyCancelled: z.boolean() });
type FilterFormValues = z.input<typeof filterFormSchema>;
type FilterFormInput = z.output<typeof filterFormSchema>;

export type OrderFiltersProps = { query: OrdersNavigationQuery };

// Source and search sit in the toolbar. What is left, courier, dates and cancelled orders, is here.
export function OrderFilters({ query }: OrderFiltersProps) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const applied = hasOrderFilters(query);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button ref={trigger} variant="secondary" className="relative gap-2">
          <SlidersHorizontal aria-hidden="true" size={16} strokeWidth={1.75} />
          Filters
          {applied ? (
            <span
              aria-hidden="true"
              className="absolute -top-1 -right-1 size-2.5 rounded-full bg-primary ring-2 ring-surface"
            />
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 p-4"
        onCloseAutoFocus={(event) => {
          // The form unmounts while a list refresh is in flight; put focus back on the trigger by hand.
          event.preventDefault();
          trigger.current?.focus();
        }}
      >
        <FilterForm query={query} applied={applied} closeFilters={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

function hasOrderFilters({ courier, createdFrom, createdThrough, stage }: OrderListQuery) {
  return Boolean(courier || createdFrom || createdThrough || stage === 'cancelled');
}

type FilterFormProps = {
  query: OrdersNavigationQuery;
  applied: boolean;
  closeFilters: () => void;
};

function FilterForm({ query, applied, closeFilters }: FilterFormProps) {
  const router = useUrlRouter();
  const [pending, startTransition] = useTransition();
  const { courier, createdFrom, createdThrough, ...other } = query;
  const onlyCancelled = query.stage === 'cancelled';
  const base = {
    ...other,
    stage: onlyCancelled ? ('to_confirm' as const) : other.stage,
    cursor: undefined,
  };
  const form = useForm<FilterFormValues, undefined, FilterFormInput>({
    resolver: zodResolver(filterFormSchema),
    values: { courier, createdFrom, createdThrough, onlyCancelled },
  });
  const navigate = (next: OrdersNavigationQuery) => {
    if (applied && !hasOrderFilters(next)) closeFilters();
    startTransition(() => router.push(`/orders?${ordersSearch(next)}`));
  };
  const submit = form.handleSubmit(({ courier, createdFrom, createdThrough, onlyCancelled }) => {
    if (pending) return;
    navigate({
      ...base,
      courier,
      createdFrom,
      createdThrough,
      ...(onlyCancelled && { stage: 'cancelled', alert: undefined }),
    });
  });

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
    <div className="grid gap-3">
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
          <div className="flex min-h-10 items-center gap-3">
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
