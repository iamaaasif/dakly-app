import Link from 'next/link';

import type { ContactResponse } from '@dakly/contracts/contacts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@dakly/ui/table';

import { customerPhone } from '../customer-labels';
import { CustomerBadges } from './customer-badges';

type CustomerListProps = { customers: ContactResponse[] };

export function CustomerList({ customers }: CustomerListProps) {
  return (
    <>
      <ul className="space-y-3 md:hidden">
        {customers.map((customer) => (
          <li key={customer.id} className="rounded-lg border border-border bg-surface p-4">
            <CustomerLink customer={customer} />
            <p className="tabular-nums">{customerPhone(customer)}</p>
            <CustomerBadges customer={customer} />
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Type and tags</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.map((customer) => (
              <TableRow key={customer.id}>
                <TableCell>
                  <CustomerLink customer={customer} />
                </TableCell>
                <TableCell className="tabular-nums">{customerPhone(customer)}</TableCell>
                <TableCell>
                  <CustomerBadges customer={customer} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

function CustomerLink({ customer }: { customer: ContactResponse }) {
  return (
    <Link
      href={`/customers/${customer.id}`}
      className="inline-flex min-h-10 items-center font-medium text-action underline"
    >
      {customer.name ?? 'No name'}
    </Link>
  );
}
