'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { Download, Search } from 'lucide-react';
import { useForm } from 'react-hook-form';

import { type ContactListQuery, contactListQuerySchema } from '@dakly/contracts/contacts';
import { formatCount } from '@dakly/contracts/money';
import { ApiError } from '@dakly/ui/api-client';
import { Button } from '@dakly/ui/button';
import { Input } from '@dakly/ui/input';
import { TableToolbar } from '@dakly/ui/table';
import { useToast } from '@dakly/ui/toast';

import { useExportCustomers } from '../api/export-customers';
import type { CustomerColumn } from '../customer-columns';
import { customersHref, type ListHref } from '../customers-query';
import { CustomerColumnsMenu } from './customer-columns-menu';
import { useSessionContext } from '@/lib/session-context';
import { useUrlRouter } from '@/lib/use-url-query';

const searchSchema = contactListQuerySchema.pick({ search: true });
type SearchInput = { search?: string };

type CustomerToolbarProps = {
  query: ContactListQuery;
  columns: CustomerColumn[];
  searchError?: string;
};

export function CustomerToolbar({ query, columns, searchError }: CustomerToolbarProps) {
  const hrefFor: ListHref = (chosen, change) => customersHref(query, chosen, change);
  return (
    <TableToolbar className="gap-3 p-4">
      <SearchField query={query} columns={columns} hrefFor={hrefFor} searchError={searchError} />
      <div className="ml-auto flex items-center gap-2">
        <ExportButton query={query} noun="customer" />
        <CustomerColumnsMenu query={query} columns={columns} hrefFor={hrefFor} />
      </div>
    </TableToolbar>
  );
}

type SearchFieldProps = CustomerToolbarProps & { hrefFor: ListHref };

export function SearchField({ query, columns, hrefFor, searchError }: SearchFieldProps) {
  const router = useUrlRouter();
  const form = useForm<SearchInput>({
    resolver: zodResolver(searchSchema),
    defaultValues: { search: query.search },
    errors: searchError ? { search: { type: 'server', message: searchError } } : undefined,
  });
  const submit = form.handleSubmit((values) =>
    router.push(hrefFor(columns, { search: values.search })),
  );
  const { onChange, ...field } = form.register('search', {
    setValueAs: (value: string) => value.trim() || undefined,
  });
  const error = form.formState.errors.search?.message;
  return (
    <form onSubmit={submit} className="relative w-full min-w-0 sm:w-80" role="search">
      <Search
        aria-hidden="true"
        size={16}
        className="pointer-events-none absolute top-3 left-3 text-text-subtle"
      />
      <Input
        {...field}
        onChange={(event) => {
          void onChange(event);
          // Clearing the box shows everyone again at once; typing waits for Enter.
          if (!event.target.value && query.search) void submit();
        }}
        type="search"
        aria-label="Search"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'customer-search-error' : undefined}
        placeholder="Search name, phone, email or area..."
        className="pl-9"
      />
      {error ? (
        <p id="customer-search-error" role="alert" className="pt-1 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}

export function ExportButton({
  query,
  noun,
}: {
  query: ContactListQuery;
  noun: 'customer' | 'contact';
}) {
  const { data: context } = useSessionContext();
  const exportCustomers = useExportCustomers();
  const showToast = useToast();
  if (!context?.currentStore?.canExportCustomers) return null;
  const { type, source, tag, minSpendPoisha, maxSpendPoisha, lastPurchase, search, hasOrdered } =
    query;
  const filters = {
    type,
    source,
    tag,
    minSpendPoisha,
    maxSpendPoisha,
    lastPurchase,
    search,
    hasOrdered,
  };
  return (
    <Button
      variant="secondary"
      className="gap-2"
      loading={exportCustomers.isPending}
      onClick={() =>
        exportCustomers.mutate(filters, {
          onSuccess: (count) =>
            showToast(
              `Exporting ${formatCount(count)} ${count === 1 ? noun : `${noun}s`} to Excel. Check your downloads in a moment.`,
            ),
          onError: (error) =>
            showToast(
              error instanceof ApiError
                ? error.message
                : 'The file could not be downloaded. Try again.',
            ),
        })
      }
    >
      <Download aria-hidden="true" size={16} strokeWidth={1.75} /> Export
    </Button>
  );
}
