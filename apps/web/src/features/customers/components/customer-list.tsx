import Link from 'next/link';
import type { ReactNode } from 'react';

import { consentChannels, type ContactListItemResponse } from '@dakly/contracts/contacts';
import { Badge } from '@dakly/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@dakly/ui/table';

import {
  type CustomerColumn,
  contactSourceLabels,
  customerColumnLabels,
} from '../customer-columns';
import { channelLabels, customerKindLabels, customerPhone } from '../customer-labels';
import { CustomerTags } from './customer-tags';
import { formatPhone } from '@/lib/format-phone';
import { initialsOf } from '@/lib/initials';

// Type always shows, between Location and Source as in the design.
const tableColumns = [
  'phone',
  'whatsapp',
  'email',
  'location',
  'type',
  'source',
  'tags',
  'consent',
] as const;
type TableColumn = (typeof tableColumns)[number];

type CustomerListProps = { customers: ContactListItemResponse[]; columns: CustomerColumn[] };

export function CustomerList({ customers, columns }: CustomerListProps) {
  return (
    <div className="space-y-4">
      <CustomerMobileList customers={customers} columns={columns} />
      <CustomerTable customers={customers} columns={columns} />
    </div>
  );
}

function CustomerMobileList({ customers, columns }: CustomerListProps) {
  return (
    <ul className="space-y-3 md:hidden">
      {customers.map((customer) => (
        <li key={customer.id} className="space-y-2 rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold text-text-muted">
              {initialsOf(customer.name ?? 'No name')}
            </span>
            <div className="min-w-0 flex-1">
              <CustomerLink customer={customer} />
              {columns.includes('phone') ? (
                <p className="text-sm text-text-muted tabular-nums">{customerPhone(customer)}</p>
              ) : null}
            </div>
            <Badge variant={customer.kind === 'customer' ? 'neutral' : 'info'}>
              {customerKindLabels[customer.kind]}
            </Badge>
          </div>
          <dl className="space-y-1 text-sm">
            {columns
              .filter((column) => column !== 'phone')
              .map((column) => (
                <div key={column} className="flex items-baseline gap-2">
                  <dt className="w-20 shrink-0 text-text-muted">{customerColumnLabels[column]}</dt>
                  <dd className="min-w-0 break-words">
                    <ColumnValue customer={customer} column={column} />
                  </dd>
                </div>
              ))}
          </dl>
        </li>
      ))}
    </ul>
  );
}

function CustomerTable({ customers, columns }: CustomerListProps) {
  const shownColumns = tableColumns.filter(
    (column) => column === 'type' || columns.includes(column),
  );
  return (
    <div className="hidden overflow-hidden rounded-lg border border-border bg-surface md:block">
      <Table>
        <TableHeader>
          <TableRow className="bg-surface-muted/50 hover:bg-surface-muted/50">
            <TableHead className="text-xs font-semibold tracking-wider text-text-muted uppercase">
              Customer
            </TableHead>
            {shownColumns.map((column) => (
              <TableHead
                key={column}
                className="text-xs font-semibold tracking-wider text-text-muted uppercase"
              >
                {column === 'type' ? 'Type' : customerColumnLabels[column]}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {customers.map((customer) => (
            <CustomerTableRow key={customer.id} customer={customer} shownColumns={shownColumns} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function CustomerTableRow({
  customer,
  shownColumns,
}: {
  customer: ContactListItemResponse;
  shownColumns: TableColumn[];
}) {
  const name = customer.name ?? 'No name';
  return (
    <TableRow className="hover:bg-surface-muted/30">
      <TableCell>
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold text-text-muted">
            {initialsOf(name)}
          </span>
          <div className="min-w-0">
            <CustomerLink customer={customer} />
          </div>
        </div>
      </TableCell>
      {shownColumns.map((column) => (
        <TableCell key={column} className="text-sm">
          {column === 'type' ? (
            <Badge variant={customer.kind === 'customer' ? 'neutral' : 'info'}>
              {customerKindLabels[customer.kind]}
            </Badge>
          ) : (
            <ColumnValue customer={customer} column={column} />
          )}
        </TableCell>
      ))}
    </TableRow>
  );
}

function CustomerLink({ customer }: { customer: ContactListItemResponse }) {
  return (
    <Link
      href={`/customers/${customer.id}`}
      className="inline-flex min-h-10 items-center font-semibold text-text hover:underline"
    >
      {customer.name ?? 'No name'}
    </Link>
  );
}

function Missing({ children }: { children: string }) {
  return <span className="text-text-subtle">{children}</span>;
}

type ColumnProps = { customer: ContactListItemResponse };

const columnValues: Record<CustomerColumn, (props: ColumnProps) => ReactNode> = {
  phone: ({ customer }) => <span className="tabular-nums">{customerPhone(customer)}</span>,
  // Messages go to the WhatsApp number, or the phone when none is set.
  whatsapp: ({ customer }) => {
    const number = customer.whatsappPhone ?? customer.phone;
    return number ? (
      <span className="tabular-nums">{formatPhone(number)}</span>
    ) : (
      <Missing>No number</Missing>
    );
  },
  email: ({ customer }) => customer.email ?? <Missing>No email</Missing>,
  location: ({ customer }) => customer.district ?? <Missing>No location</Missing>,
  source: ({ customer }) => contactSourceLabels[customer.source],
  tags: ({ customer }) =>
    customer.tags.length ? <CustomerTags tags={customer.tags} /> : <Missing>No tags</Missing>,
  consent: ({ customer }) => {
    const agreed = consentChannels.filter((channel) =>
      customer.consentedChannels.includes(channel),
    );
    if (!agreed.length) return <Missing>None</Missing>;
    return (
      <span className="flex flex-wrap gap-1">
        {agreed.map((channel) => (
          <Badge key={channel} variant="success">
            {channelLabels[channel]}
          </Badge>
        ))}
      </span>
    );
  },
};

function ColumnValue({ customer, column }: ColumnProps & { column: CustomerColumn }) {
  return columnValues[column]({ customer });
}
