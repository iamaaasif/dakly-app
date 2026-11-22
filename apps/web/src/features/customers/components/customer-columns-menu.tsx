'use client';
import { Columns2 } from 'lucide-react';

import type { ContactListQuery } from '@dakly/contracts/contacts';
import { Button } from '@dakly/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@dakly/ui/dropdown-menu';

import { customersSearch } from '../api/customers';
import {
  type CustomerColumn,
  customerColumnLabels,
  customerColumns,
  customerColumnsParam,
} from '../customer-columns';
import { useUrlRouter } from '@/lib/use-url-query';

type CustomerColumnsMenuProps = { query: ContactListQuery; columns: CustomerColumn[] };

export function CustomerColumnsMenu({ query, columns }: CustomerColumnsMenuProps) {
  const router = useUrlRouter();
  const choose = (column: CustomerColumn, on: boolean) => {
    const chosen = customerColumns.filter((each) =>
      each === column ? on : columns.includes(each),
    );
    router.replace(
      `/customers?${customersSearch({ kind: query.kind, search: query.search, tag: query.tag, cursor: query.cursor, columns: customerColumnsParam(chosen) })}`,
    );
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="secondary" className="shrink-0 gap-2">
          <Columns2 aria-hidden="true" size={16} strokeWidth={1.75} /> Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-52 p-2">
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
