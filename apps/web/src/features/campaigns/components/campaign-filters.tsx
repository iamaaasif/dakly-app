'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { FormProvider, useForm, useFormContext } from 'react-hook-form';
import { z } from 'zod';

import { campaignListQuerySchema, type CampaignListQuery } from '@dakly/contracts/campaigns';
import { Button } from '@dakly/ui/button';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';

import { campaignListHref } from '../api/campaigns';
import { campaignChannelLabels, campaignStatusLabels } from '../campaign-labels';

const { search, status, channel } = campaignListQuerySchema.shape;
const empty = z.literal('');
const filterFields = z.strictObject({
  search: search.or(empty),
  status: status.or(empty),
  channel: channel.or(empty),
  createdFrom: z.string().optional(),
  createdThrough: z.string().optional(),
});
type FiltersInput = z.input<typeof filterFields>;

const optional = { setValueAs: (value: string) => value.trim() || undefined };
const selectClass =
  'min-h-10 w-full rounded-md border border-input-border bg-surface px-3 text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

const campaignFilterSchema = filterFields
  .transform((filters): z.input<typeof campaignListQuerySchema> => ({
    search: filters.search || undefined,
    status: filters.status || undefined,
    channel: filters.channel || undefined,
    createdFrom: filters.createdFrom || undefined,
    createdThrough: filters.createdThrough || undefined,
  }))
  .pipe(campaignListQuerySchema);

export function CampaignFilters({ query }: { query: CampaignListQuery }) {
  const router = useRouter();
  const { search = '', status = '', channel = '', createdFrom = '', createdThrough = '' } = query;
  const form = useForm<FiltersInput, unknown, CampaignListQuery>({
    resolver: zodResolver(campaignFilterSchema),
    defaultValues: { search, status, channel, createdFrom, createdThrough },
  });
  const { getValues, reset, resetField } = form;
  useEffect(() => {
    resetField('search', { defaultValue: search });
  }, [search, resetField]);
  useEffect(() => {
    reset({ search: getValues('search'), status, channel, createdFrom, createdThrough });
  }, [status, channel, createdFrom, createdThrough, getValues, reset]);
  const visit = (filters: CampaignListQuery) =>
    router.push(campaignListHref({ ...filters, limit: query.limit }));
  const apply = form.handleSubmit(visit);
  function applyFilter() {
    const parsed = campaignFilterSchema.safeParse({
      ...getValues(),
      search,
    });
    if (parsed.success) visit(parsed.data);
    else void form.trigger();
  }
  function clear() {
    reset({
      search: '',
      status: '',
      channel: '',
      createdFrom: '',
      createdThrough: '',
    });
    router.push('/campaigns');
  }

  return (
    <FormProvider {...form}>
      <form
        aria-label="Filter campaigns"
        onSubmit={apply}
        className="grid grid-cols-2 items-start gap-3 xl:flex"
      >
        <FilterFields applyFilter={applyFilter} />
        <button
          type="button"
          onClick={clear}
          className="inline-flex min-h-10 items-center justify-self-start text-action underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus xl:self-end"
        >
          Clear filters
        </button>
      </form>
    </FormProvider>
  );
}

function FilterFields({ applyFilter }: { applyFilter: () => void }) {
  const { register } = useFormContext<FiltersInput>();
  return (
    <>
      <div className="col-span-2 min-w-0 xl:flex-1">
        <FormField name="search" label="Search">
          {(control) => (
            <div className="flex gap-2">
              <Input
                {...control}
                {...register('search', optional)}
                type="search"
                placeholder="Campaign name"
              />
              <Button type="submit" variant="secondary">
                Search
              </Button>
            </div>
          )}
        </FormField>
      </div>
      <FilterSelect
        name="status"
        label="Status"
        empty="All statuses"
        options={campaignStatusLabels}
        applyFilter={applyFilter}
      />
      <FilterSelect
        name="channel"
        label="Channel"
        empty="All channels"
        options={campaignChannelLabels}
        applyFilter={applyFilter}
      />
      <div className="min-w-0">
        <FormField name="createdFrom" label="Created from">
          {(control) => (
            <Input
              {...control}
              {...register('createdFrom', { ...optional, onChange: applyFilter })}
              type="date"
            />
          )}
        </FormField>
      </div>
      <div className="min-w-0">
        <FormField name="createdThrough" label="Created through">
          {(control) => (
            <Input
              {...control}
              {...register('createdThrough', { ...optional, onChange: applyFilter })}
              type="date"
            />
          )}
        </FormField>
      </div>
    </>
  );
}

function FilterSelect({
  name,
  label,
  empty,
  options,
  applyFilter,
}: {
  name: 'status' | 'channel';
  label: string;
  empty: string;
  options: Record<string, string>;
  applyFilter: () => void;
}) {
  const { register } = useFormContext<FiltersInput>();
  return (
    <div className="min-w-0">
      <FormField name={name} label={label}>
        {(control) => (
          <select
            {...control}
            {...register(name, { ...optional, onChange: applyFilter })}
            className={selectClass}
          >
            <option value="">{empty}</option>
            {Object.entries(options).map(([id, text]) => (
              <option key={id} value={id}>
                {text}
              </option>
            ))}
          </select>
        )}
      </FormField>
    </div>
  );
}
