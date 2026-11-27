'use client';
import { Upload } from 'lucide-react';

import type { ContactListQuery, ContactSource } from '@dakly/contracts/contacts';
import { Button } from '@dakly/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dakly/ui/select';
import { TableToolbar } from '@dakly/ui/table';

import { type CustomerColumn, contactSourceLabels } from '../customer-columns';
import { type ListHref } from '../customers-query';
import { CustomerColumnsMenu } from './customer-columns-menu';
import { ExportButton, SearchField } from './customer-toolbar';
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
  const sourceChoices = Object.entries(contactSourceLabels).map(([value, label]) => ({
    value,
    label,
  }));
  return (
    <TableToolbar className="gap-3 p-4">
      <SearchField query={query} columns={columns} hrefFor={hrefFor} searchError={searchError} />
      <FilterSelect
        label="Source"
        allLabel="Any source"
        value={query.source}
        options={sourceChoices}
        onChange={(source) => router.push(hrefFor(columns, { source: source as ContactSource }))}
      />
      <FilterSelect
        label="Tag"
        allLabel="All tags"
        value={query.tag}
        options={tagChoices.map((tag) => ({ value: tag, label: tag }))}
        onChange={(tag) => router.push(hrefFor(columns, { tag }))}
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

type FilterSelectProps = {
  label: string;
  allLabel: string;
  value: string | undefined;
  options: { value: string; label: string }[];
  // Called with undefined when the shop picks "all".
  onChange: (value: string | undefined) => void;
};

function FilterSelect({ label, allLabel, value, options, onChange }: FilterSelectProps) {
  return (
    <Select
      value={value ?? everything}
      onValueChange={(next) => onChange(next === everything ? undefined : next)}
    >
      <SelectTrigger aria-label={label} className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={everything}>{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
