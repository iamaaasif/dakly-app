'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Controller, FormProvider, useForm, useFormContext, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { campaignListQuerySchema, type CampaignListQuery } from '@dakly/contracts/campaigns';
import { Button } from '@dakly/ui/button';
import { cn } from '@dakly/ui/cn';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';
import { Label } from '@dakly/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dakly/ui/select';

import { campaignListHref } from '../api/campaigns';
import { campaignChannelLabels, campaignStatusLabels } from '../campaign-labels';
import { useSearchAsYouType } from '@/lib/use-search-as-you-type';
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
const everything = 'all';

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
  // A new key empties the search box even when the address already shows no search.
  const [searchBox, setSearchBox] = useState(0);
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
    setSearchBox(searchBox + 1);
    router.push('/campaigns');
  };

  return (
    <div className="grid grid-cols-2 items-start gap-3 lg:grid-cols-[minmax(0,1fr)_10rem_auto_auto]">
      <CampaignSearch key={searchBox} query={query} visit={visit} />
      <FormProvider {...form}>
        <form aria-label="Filter campaigns" onSubmit={applyFilter} className="contents">
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
    </div>
  );
}

function CampaignSearch({
  query,
  visit,
}: {
  query: CampaignListQuery;
  visit: (filters: CampaignListQuery) => void;
}) {
  const router = useUrlRouter();
  const form = useForm<{ search?: string }>({ defaultValues: { search: query.search } });
  const typed = useWatch({ control: form.control, name: 'search' });
  const next = (search: string | undefined) => ({ ...query, search, cursor: undefined });
  useSearchAsYouType(typed, query.search, (search) =>
    router.replace(campaignListHref({ ...next(search), limit: query.limit })),
  );
  // Back and Forward change the address; the box follows it.
  useEffect(() => {
    if ((form.getValues('search')?.trim() || undefined) !== query.search)
      form.reset({ search: query.search });
  }, [form, query.search]);
  const field = form.register('search');
  return (
    <form
      role="search"
      onSubmit={form.handleSubmit(({ search }) => visit(next(search?.trim() || undefined)))}
      className="relative col-span-2 min-w-0 lg:col-span-1"
    >
      <Label htmlFor="campaign-search" className="mb-1.5 block">
        Search
      </Label>
      <div className="relative">
        <Search
          aria-hidden="true"
          size={16}
          className="pointer-events-none absolute top-3 left-3 text-text-subtle"
        />
        <Input
          {...field}
          id="campaign-search"
          type="search"
          placeholder="Search campaign name..."
          className="pl-9 [&::-webkit-search-cancel-button]:hidden"
        />
        {typed ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => form.setValue('search', '', { shouldDirty: true })}
            className="absolute top-0 right-0 flex size-10 items-center justify-center text-text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-focus"
          >
            <X aria-hidden="true" size={16} strokeWidth={1.75} />
          </button>
        ) : null}
      </div>
    </form>
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
  const { control } = useFormContext<FiltersInput>();
  return (
    <div className="min-w-0">
      <FormField name={name} label={label}>
        {(field) => (
          <Controller
            control={control}
            name={name}
            render={({ field: { value, onChange } }) => (
              <Select
                value={value || everything}
                onValueChange={(next) => {
                  onChange(next === everything ? '' : next);
                  applyFilter();
                }}
              >
                <SelectTrigger id={field.id}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" align="start">
                  <SelectItem value={everything}>{empty}</SelectItem>
                  {Object.entries(options).map(([id, text]) => (
                    <SelectItem key={id} value={id}>
                      {text}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        )}
      </FormField>
    </div>
  );
}
