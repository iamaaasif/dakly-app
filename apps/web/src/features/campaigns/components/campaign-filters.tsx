'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { FormProvider, useForm, useFormContext } from 'react-hook-form';
import { z } from 'zod';

import { campaignListQuerySchema, type CampaignListQuery } from '@dakly/contracts/campaigns';
import { Button } from '@dakly/ui/button';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';

import { campaignListHref } from '../api/campaigns';
import { campaignChannelLabels, campaignStatusLabels } from '../campaign-labels';
import { dhakaDateBoundary, dhakaDateField } from '@/lib/format-date';

const { search, status, channel } = campaignListQuerySchema.shape;
const empty = z.literal('');
const dateField = z.iso.date().or(empty).optional();
const filterFields = z.strictObject({
  search: search.or(empty),
  status: status.or(empty),
  channel: channel.or(empty),
  createdFrom: dateField,
  createdBefore: dateField,
});
type FiltersInput = z.input<typeof filterFields>;

const optional = { setValueAs: (value: string) => value.trim() || undefined };
const selectClass =
  'min-h-10 w-full rounded-md border border-input-border bg-surface px-3 text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

function campaignFilterSchema(
  query: CampaignListQuery,
  initialFrom?: string,
  initialBefore?: string,
) {
  return filterFields
    .transform(
      ({ createdFrom, createdBefore, ...filters }): z.input<typeof campaignListQuerySchema> => ({
        search: filters.search || undefined,
        status: filters.status || undefined,
        channel: filters.channel || undefined,
        createdFrom:
          createdFrom === initialFrom ? query.createdFrom : dhakaDateBoundary(createdFrom ?? ''),
        createdBefore:
          createdBefore === initialBefore
            ? query.createdBefore
            : dhakaDateBoundary(createdBefore ?? '', true),
      }),
    )
    .pipe(campaignListQuerySchema);
}

export function CampaignFilters({ query }: { query: CampaignListQuery }) {
  const router = useRouter();
  const initialFrom = query.createdFrom ? dhakaDateField(query.createdFrom) : undefined;
  const initialBefore = query.createdBefore ? dhakaDateField(query.createdBefore, true) : undefined;
  const form = useForm<FiltersInput, unknown, CampaignListQuery>({
    resolver: zodResolver(campaignFilterSchema(query, initialFrom, initialBefore)),
    defaultValues: {
      search: query.search ?? '',
      status: query.status ?? '',
      channel: query.channel ?? '',
      createdFrom: initialFrom ?? '',
      createdBefore: initialBefore ?? '',
    },
  });
  const apply = form.handleSubmit((filters) =>
    router.push(campaignListHref({ ...filters, limit: query.limit })),
  );
  function clear() {
    form.reset({
      search: '',
      status: '',
      channel: '',
      createdFrom: '',
      createdBefore: '',
    });
    router.push('/campaigns');
  }

  return (
    <FormProvider {...form}>
      <form
        aria-label="Filter campaigns"
        onSubmit={apply}
        className="space-y-3 rounded-lg border border-border bg-surface p-4"
      >
        <FilterFields />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="secondary">
            Apply filters
          </Button>
          <button
            type="button"
            onClick={clear}
            className="inline-flex min-h-10 items-center text-action underline"
          >
            Clear filters
          </button>
        </div>
      </form>
    </FormProvider>
  );
}

function FilterFields() {
  const { register } = useFormContext<FiltersInput>();
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <div className="col-span-2 min-w-0 lg:col-span-1">
        <FormField name="search" label="Search">
          {(control) => (
            <Input
              {...control}
              {...register('search', optional)}
              type="search"
              placeholder="Campaign name"
            />
          )}
        </FormField>
      </div>
      <FilterSelect
        name="status"
        label="Status"
        empty="All statuses"
        options={campaignStatusLabels}
      />
      <FilterSelect
        name="channel"
        label="Channel"
        empty="All channels"
        options={campaignChannelLabels}
      />
      <div className="min-w-0">
        <FormField name="createdFrom" label="Created from">
          {(control) => <Input {...control} {...register('createdFrom', optional)} type="date" />}
        </FormField>
      </div>
      <div className="min-w-0">
        <FormField name="createdBefore" label="Created through">
          {(control) => <Input {...control} {...register('createdBefore', optional)} type="date" />}
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
}: {
  name: 'status' | 'channel';
  label: string;
  empty: string;
  options: Record<string, string>;
}) {
  const { register } = useFormContext<FiltersInput>();
  return (
    <div className="min-w-0">
      <FormField name={name} label={label}>
        {(control) => (
          <select {...control} {...register(name, optional)} className={selectClass}>
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
