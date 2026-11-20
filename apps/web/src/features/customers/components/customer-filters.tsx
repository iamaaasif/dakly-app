'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { Search } from 'lucide-react';
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

const optional = { setValueAs: (value: string) => value.trim() || undefined };

export function CustomerFilters({ query, searchError }: CustomerFiltersProps) {
  const router = useRouter();
  const form = useForm<CustomerFilterInput>({
    resolver: zodResolver(filterSchema),
    defaultValues: { search: query.search, tag: query.tag },
    errors: searchError ? { search: { type: 'server', message: searchError } } : undefined,
  });
  const onSubmit = form.handleSubmit((values) =>
    router.push(`/customers?${customersSearch({ kind: query.kind, ...values })}`),
  );

  return (
    <div className="space-y-4">
      <CustomerKindsNav query={query} />
      <FormProvider {...form}>
        <form onSubmit={onSubmit} className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="flex-1">
            <FormField
              name="search"
              label="Search"
              hint="A name (3 letters or more) or a full mobile number"
            >
              {(control) => (
                <div className="relative">
                  <Search
                    aria-hidden="true"
                    size={16}
                    className="absolute top-1/2 left-3 -translate-y-1/2 text-text-subtle"
                  />
                  <Input
                    {...control}
                    {...form.register('search', optional)}
                    type="search"
                    placeholder="Search name or phone"
                    className="pl-9"
                  />
                </div>
              )}
            </FormField>
          </div>
          <div className="w-full lg:w-48">
            <FormField name="tag" label="Tag">
              {(control) => (
                <Input
                  {...control}
                  {...form.register('tag', optional)}
                  placeholder="Filter by tag"
                />
              )}
            </FormField>
          </div>
          <Button type="submit" variant="secondary" className="shrink-0">
            Search customers
          </Button>
        </form>
      </FormProvider>
    </div>
  );
}

function CustomerKindsNav({ query }: { query: ContactListQuery }) {
  const kindHref = (kind?: ContactListQuery['kind']) =>
    `/customers?${customersSearch({ kind, search: query.search, tag: query.tag })}`;
  return (
    <nav
      aria-label="Customer types"
      className="flex gap-2 overflow-x-auto border-b border-border text-sm"
    >
      {[undefined, ...contactKinds].map((kind) => (
        <Link
          key={kind ?? 'all'}
          href={kindHref(kind)}
          aria-current={query.kind === kind ? 'page' : undefined}
          className="-mb-px inline-flex min-h-10 shrink-0 items-center border-b-2 border-transparent px-3 text-text-muted transition-colors hover:text-text aria-[current=page]:border-action aria-[current=page]:font-semibold aria-[current=page]:text-text"
        >
          {kind ? customerKindLabels[kind] : 'All'}
        </Link>
      ))}
    </nav>
  );
}
