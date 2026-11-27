'use client';
import { Upload } from 'lucide-react';

import type { ContactListQuery, ContactSource } from '@dakly/contracts/contacts';
import { Button } from '@dakly/ui/button';
import { TableToolbar } from '@dakly/ui/table';

import type { CustomerColumn } from '../customer-columns';
import { sourceOptions } from '../customer-filter-options';
import { type ListHref } from '../customers-query';
import { CustomerColumnsMenu } from './customer-columns-menu';
import { ExportButton, FilterSelect, SearchField } from './customer-toolbar';
import { useSessionContext } from '@/lib/session-context';
import { useUrlRouter } from '@/lib/use-url-query';

type ContactToolbarProps = {
  query: ContactListQuery;
  columns: CustomerColumn[];
  hrefFor: ListHref;
  // Every tag the shop uses.
  tags: string[];
  searchError?: string;
  onImport: () => void;
};

const everything = 'all';
const pick = (value: string) => (value === everything ? undefined : value);

export function ContactToolbar({
  query,
  columns,
  hrefFor,
  tags,
  searchError,
  onImport,
}: ContactToolbarProps) {
  const router = useUrlRouter();
  const { data: context } = useSessionContext();
  const tagChoices = query.tag && !tags.includes(query.tag) ? [query.tag, ...tags] : tags;
  return (
    <TableToolbar className="gap-3 p-4">
      <SearchField query={query} columns={columns} hrefFor={hrefFor} searchError={searchError} />
      <FilterSelect
        label="Source"
        value={query.source ?? everything}
        onChange={(source) =>
          router.push(hrefFor(columns, { source: pick(source) as ContactSource | undefined }))
        }
        options={[{ value: everything, label: 'Any source' }, ...sourceOptions]}
      />
      <FilterSelect
        label="Tag"
        value={query.tag ?? everything}
        onChange={(tag) => router.push(hrefFor(columns, { tag: pick(tag) }))}
        options={[
          { value: everything, label: 'All tags' },
          ...tagChoices.map((tag) => ({ value: tag, label: tag })),
        ]}
      />
      <div className="ml-auto flex items-center gap-2">
        {context?.currentStore?.canCreateCustomer ? (
          <Button variant="secondary" className="gap-2" onClick={onImport}>
            <Upload aria-hidden="true" size={16} strokeWidth={1.75} /> Import
          </Button>
        ) : null}
        <ExportButton query={query} noun="contact" />
        <CustomerColumnsMenu query={query} columns={columns} hrefFor={hrefFor} />
      </div>
    </TableToolbar>
  );
}
