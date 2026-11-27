'use client';
import { Columns3 } from 'lucide-react';

import type { ContactListQuery } from '@dakly/contracts/contacts';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@dakly/ui/dropdown-menu';

import { type CustomerColumn, customerColumnLabels, customerColumns } from '../customer-columns';
import { customersHref } from '../customers-query';
import { useUrlRouter } from '@/lib/use-url-query';

type CustomerColumnsMenuProps = { query: ContactListQuery; columns: CustomerColumn[] };

export function CustomerColumnsMenu({ query, columns }: CustomerColumnsMenuProps) {
  const router = useUrlRouter();
  const choose = (column: CustomerColumn, on: boolean) => {
    const chosen = customerColumns.filter((each) =>
      each === column ? on : columns.includes(each),
    );
    router.replace(customersHref(query, chosen, { cursor: query.cursor }));
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Columns"
        className="grid size-10 shrink-0 place-items-center rounded-md border border-input-border bg-surface text-text-secondary transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <Columns3 aria-hidden="true" size={18} strokeWidth={1.75} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 p-2">
        {customerColumns.map((column) => (
          <DropdownMenuCheckboxItem
            key={column}
            checked={columns.includes(column)}
            onCheckedChange={(on) => choose(column, on)}
          >
            {customerColumnLabels[column]}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
