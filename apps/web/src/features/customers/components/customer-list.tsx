import Link from 'next/link';

import type { ContactResponse } from '@dakly/contracts/contacts';
import { Badge } from '@dakly/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@dakly/ui/table';

import { customerKindLabels, customerPhone } from '../customer-labels';
import { CustomerTags } from './customer-badges';
import { initialsOf } from '@/lib/initials';

type CustomerListProps = { customers: ContactResponse[] };

export function CustomerList({ customers }: CustomerListProps) {
  return (
    <div className="space-y-4">
      <CustomerMobileList customers={customers} />
      <CustomerTable customers={customers} />
    </div>
  );
}

function CustomerMobileList({ customers }: CustomerListProps) {
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
              <p className="text-sm text-text-muted tabular-nums">{customerPhone(customer)}</p>
            </div>
            <Badge variant={customer.kind === 'customer' ? 'neutral' : 'info'}>
              {customerKindLabels[customer.kind]}
            </Badge>
          </div>
          <CustomerTags tags={customer.tags} />
        </li>
      ))}
    </ul>
  );
}

function CustomerTable({ customers }: CustomerListProps) {
  return (
    <div className="hidden overflow-hidden rounded-lg border border-border bg-surface md:block">
      <Table>
        <TableHeader>
          <TableRow className="bg-surface-muted/50 hover:bg-surface-muted/50">
            <TableHead className="text-xs font-semibold tracking-wider text-text-muted uppercase">
              Customer
            </TableHead>
            <TableHead className="text-xs font-semibold tracking-wider text-text-muted uppercase">
              Phone
            </TableHead>
            <TableHead className="text-xs font-semibold tracking-wider text-text-muted uppercase">
              Type
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {customers.map((customer) => (
            <CustomerTableRow key={customer.id} customer={customer} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function CustomerTableRow({ customer }: { customer: ContactResponse }) {
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
            <CustomerTags tags={customer.tags} />
          </div>
        </div>
      </TableCell>
      <TableCell className="text-sm tabular-nums">{customerPhone(customer)}</TableCell>
      <TableCell>
        <Badge variant={customer.kind === 'customer' ? 'neutral' : 'info'}>
          {customerKindLabels[customer.kind]}
        </Badge>
      </TableCell>
    </TableRow>
  );
}

function CustomerLink({ customer }: { customer: ContactResponse }) {
  return (
    <Link
      href={`/customers/${customer.id}`}
      className="inline-flex min-h-10 items-center font-semibold text-text hover:underline"
    >
      {customer.name ?? 'No name'}
    </Link>
  );
}
