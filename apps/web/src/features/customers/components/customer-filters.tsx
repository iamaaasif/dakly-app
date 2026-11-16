'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormProvider, useForm } from 'react-hook-form';

import {
  type ContactListQuery,
  contactKinds,
  contactListQuerySchema,
} from '@dakly/contracts/contacts';
import { Button } from '@dakly/ui/button';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';

import { customersSearch } from '../api/customers';
import { customerKindLabels } from '../customer-labels';

const filterSchema = contactListQuerySchema.pick({ search: true, tag: true });
type CustomerFilterInput = Pick<ContactListQuery, 'search' | 'tag'>;

type CustomerFiltersProps = {
  query: ContactListQuery;
  searchError?: string;
};

export function CustomerFilters({ query, searchError }: CustomerFiltersProps) {
  const router = useRouter();
  const form = useForm<CustomerFilterInput>({
    resolver: zodResolver(filterSchema),
    defaultValues: { search: query.search, tag: query.tag },
    errors: searchError ? { search: { type: 'server', message: searchError } } : undefined,
  });
  const optional = { setValueAs: (value: string) => value.trim() || undefined };
  const onSubmit = form.handleSubmit((values) =>
    router.push(`/customers?${customersSearch({ kind: query.kind, ...values })}`),
  );
  const kindHref = (kind?: ContactListQuery['kind']) =>
    `/customers?${customersSearch({ kind, search: query.search, tag: query.tag })}`;

  return (
    <div className="space-y-4">
      <nav
        aria-label="Customer types"
        className="flex gap-1 overflow-x-auto border-b border-border"
      >
        {[undefined, ...contactKinds].map((kind) => (
          <Link
            key={kind ?? 'all'}
            href={kindHref(kind)}
            aria-current={query.kind === kind ? 'page' : undefined}
            className="-mb-px inline-flex min-h-10 shrink-0 items-center border-b-2 border-transparent px-3 text-text-muted aria-[current=page]:border-action aria-[current=page]:font-medium aria-[current=page]:text-text"
          >
            {kind ? customerKindLabels[kind] : 'All'}
          </Link>
        ))}
      </nav>
      <FormProvider {...form}>
        <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-2">
          <FormField
            name="search"
            label="Search"
            hint="A name (3 letters or more) or a full mobile number"
          >
            {(control) => (
              <Input {...control} {...form.register('search', optional)} type="search" />
            )}
          </FormField>
          <FormField name="tag" label="Tag">
            {(control) => <Input {...control} {...form.register('tag', optional)} />}
          </FormField>
          <Button type="submit" variant="secondary" className="md:w-fit">
            Search customers
          </Button>
        </form>
      </FormProvider>
    </div>
  );
}
