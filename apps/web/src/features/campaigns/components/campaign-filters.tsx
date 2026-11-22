'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { SlidersHorizontal } from 'lucide-react';
import { useId, useState } from 'react';
import { FormProvider, useForm, useFormContext } from 'react-hook-form';
import { z } from 'zod';

import { campaignListQuerySchema, type CampaignListQuery } from '@dakly/contracts/campaigns';
import { Button } from '@dakly/ui/button';
import { cn } from '@dakly/ui/cn';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';

import { campaignListHref } from '../api/campaigns';
import { campaignChannelLabels, campaignStatusLabels } from '../campaign-labels';
import { useUrlRouter } from '@/lib/use-url-query';

const { status, channel } = campaignListQuerySchema.shape;
const empty = z.literal('');
const filterFields = z.strictObject({
  search: z.string().optional(),
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
    search: filters.search?.trim() || undefined,
    status: filters.status || undefined,
    channel: filters.channel || undefined,
    createdFrom: filters.createdFrom || undefined,
    createdThrough: filters.createdThrough || undefined,
  }))
  .pipe(campaignListQuerySchema);

export function CampaignFilters({ query }: { query: CampaignListQuery }) {
  const router = useUrlRouter();
  const [expanded, setExpanded] = useState(false);
  const advancedId = useId();
  const { search = '', status = '', channel = '', createdFrom = '', createdThrough = '' } = query;
  const form = useForm<FiltersInput, unknown, CampaignListQuery>({
    resolver: zodResolver(campaignFilterSchema),
    values: { search, status, channel, createdFrom, createdThrough },
  });
  const visit = (filters: CampaignListQuery) =>
    router.push(campaignListHref({ ...filters, limit: query.limit }));
  const applyFilter = form.handleSubmit(visit, ({ createdFrom, createdThrough }) => {
    if (createdFrom || createdThrough) setExpanded(true);
  });
  const clear = () => {
    form.reset({ search: '', status: '', channel: '', createdFrom: '', createdThrough: '' });
    router.push('/campaigns');
  };

  return (
    <FormProvider {...form}>
      <form
        aria-label="Filter campaigns"
        onSubmit={applyFilter}
        className="grid grid-cols-2 items-start gap-3 lg:grid-cols-[minmax(0,1fr)_10rem_auto_auto]"
      >
        <CampaignSearch />
        <FilterSelect
          name="status"
          label="Status"
          empty="All statuses"
          options={campaignStatusLabels}
          applyFilter={applyFilter}
        />
        <Button
          variant="secondary"
          aria-expanded={expanded}
          aria-controls={advancedId}
          className="self-end justify-self-start"
          onClick={() => setExpanded(!expanded)}
        >
          <SlidersHorizontal aria-hidden="true" size={16} strokeWidth={1.75} />
          Filters
        </Button>
        <div hidden={!expanded} id={advancedId} className="col-span-full">
          <AdvancedFilters applyFilter={applyFilter} />
        </div>
        <button
          type="button"
          onClick={clear}
          className={cn(
            'inline-flex min-h-10 items-center self-end justify-self-start text-action underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
            expanded ? 'col-span-full justify-self-end' : 'lg:col-start-4 lg:row-start-1',
          )}
        >
          Clear filters
        </button>
      </form>
    </FormProvider>
  );
}

function CampaignSearch() {
  const { register } = useFormContext<FiltersInput>();
  return (
    <div className="col-span-2 min-w-0 lg:col-span-1">
      <FormField name="search" label="Search">
        {(control) => (
          <div className="flex gap-2">
            <Input {...control} {...register('search')} type="search" placeholder="Campaign name" />
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </div>
        )}
      </FormField>
    </div>
  );
}

function AdvancedFilters({ applyFilter }: { applyFilter: () => void }) {
  const { register } = useFormContext<FiltersInput>();
  return (
    <div className="grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-3">
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
    </div>
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
