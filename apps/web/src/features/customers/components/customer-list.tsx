'use client';
import Link from 'next/link';
import { type ReactNode, useState } from 'react';

import { consentChannels, type ContactListItemResponse } from '@dakly/contracts/contacts';
import { formatMoney } from '@dakly/contracts/money';
import { Badge } from '@dakly/ui/badge';
import { Checkbox } from '@dakly/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@dakly/ui/table';

import {
  type CustomerColumn,
  contactSourceLabels,
  customerColumnLabels,
} from '../customer-columns';
import { channelLabels, customerPhone, customerTypePill } from '../customer-labels';
import { CustomerTags } from './customer-tags';
import { formatShortDate } from '@/lib/format-date';
import { formatPhone } from '@/lib/format-phone';
import { initialsOf } from '@/lib/initials';

// Columns before and after the always-on stats, in the order of the design.
const leadingColumns = ['phone', 'whatsapp', 'email', 'location'] as const;
const trailingColumns = ['source', 'tags', 'consent'] as const;

type CustomerListProps = {
  customers: ContactListItemResponse[];
  columns: CustomerColumn[];
  onSelectionChange: (count: number) => void;
  // The Contacts page lists people who may never have ordered, so it leaves the order columns out.
  withOrders?: boolean;
};

export function CustomerList(props: CustomerListProps) {
  return (
    <>
      <CustomerMobileList {...props} />
      <CustomerTable {...props} />
    </>
  );
}

const headClass =
  'whitespace-nowrap px-1.5 text-xs font-semibold tracking-wide text-text-muted uppercase';

function shownColumns(columns: CustomerColumn[], list: readonly CustomerColumn[]) {
  return list.filter((column) => columns.includes(column));
}

function selectAllState(customers: ContactListItemResponse[], selected: ReadonlySet<string>) {
  if (customers.every((customer) => selected.has(customer.id))) return true;
  return selected.size ? 'indeterminate' : false;
}

function ColumnHeads({
  columns,
  list,
}: {
  columns: CustomerColumn[];
  list: readonly CustomerColumn[];
}) {
  return shownColumns(columns, list).map((column) => (
    <TableHead key={column} className={headClass}>
      {customerColumnLabels[column]}
    </TableHead>
  ));
}

function OrderHeads() {
  return (
    <>
      <TableHead className={`${headClass} text-right`}>Orders</TableHead>
      <TableHead className={`${headClass} text-right`}>Spent</TableHead>
      <TableHead className={`${headClass} whitespace-normal`}>Last purchase</TableHead>
    </>
  );
}

function CustomerTable({
  customers,
  columns,
  onSelectionChange,
  withOrders = true,
}: CustomerListProps) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const choose = (next: Set<string>) => {
    setSelected(next);
    onSelectionChange(next.size);
  };
  const toggle = (id: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    choose(next);
  };
  return (
    <div className="hidden md:block">
      <Table bare className="text-xs">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-9 pr-0 pl-3">
              <Checkbox
                aria-label="Select all customers on this page"
                checked={selectAllState(customers, selected)}
                onCheckedChange={(on) =>
                  choose(on === true ? new Set(customers.map((each) => each.id)) : new Set())
                }
              />
            </TableHead>
            <TableHead className={headClass}>Customer</TableHead>
            <ColumnHeads columns={columns} list={leadingColumns} />
            <TableHead className={headClass}>Type</TableHead>
            {withOrders ? <OrderHeads /> : null}
            <ColumnHeads columns={columns} list={trailingColumns} />
          </TableRow>
        </TableHeader>
        <TableBody>
          {customers.map((customer) => (
            <CustomerTableRow
              key={customer.id}
              customer={customer}
              columns={columns}
              withOrders={withOrders}
              selected={selected.has(customer.id)}
              onToggle={(on) => toggle(customer.id, on)}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

type CustomerTableRowProps = {
  customer: ContactListItemResponse;
  columns: CustomerColumn[];
  selected: boolean;
  withOrders: boolean;
  onToggle: (on: boolean) => void;
};

function CustomerTableRow({
  customer,
  columns,
  selected,
  withOrders,
  onToggle,
}: CustomerTableRowProps) {
  return (
    <TableRow data-state={selected ? 'selected' : undefined}>
      <TableCell className="pr-0 pl-3">
        <Checkbox
          aria-label={`Select ${customer.name ?? 'No name'}`}
          checked={selected}
          onCheckedChange={(on) => onToggle(on === true)}
        />
      </TableCell>
      <TableCell className="px-1.5">
        <div className="flex items-center gap-2">
          <Avatar name={customer.name} />
          <CustomerLink customer={customer} />
        </div>
      </TableCell>
      {shownColumns(columns, leadingColumns).map((column) => (
        <TableCell
          key={column}
          className={column === 'location' ? 'px-1.5' : 'px-1.5 whitespace-nowrap'}
        >
          <ColumnValue customer={customer} column={column} />
        </TableCell>
      ))}
      <TableCell className="px-1.5">
        <TypePill customer={customer} />
      </TableCell>
      {withOrders ? (
        <>
          <TableCell className="px-1.5 text-right">{customer.ordersCount}</TableCell>
          <TableCell className="px-1.5 text-right font-medium whitespace-nowrap">
            {formatMoney(customer.netSpendPoisha)}
          </TableCell>
          <TableCell className="px-1.5 whitespace-nowrap">
            <LastPurchase customer={customer} />
          </TableCell>
        </>
      ) : null}
      {shownColumns(columns, trailingColumns).map((column) => (
        <TableCell
          key={column}
          className={column === 'source' ? 'px-1.5 whitespace-nowrap' : 'px-1.5'}
        >
          <ColumnValue customer={customer} column={column} />
        </TableCell>
      ))}
    </TableRow>
  );
}

function CustomerMobileList({
  customers,
  columns,
  withOrders = true,
}: Omit<CustomerListProps, 'onSelectionChange'>) {
  return (
    <ul className="divide-y divide-border md:hidden">
      {customers.map((customer) => (
        <li key={customer.id} className="space-y-2 p-4">
          <div className="flex items-center gap-3">
            <Avatar name={customer.name} />
            <div className="min-w-0 flex-1">
              <CustomerLink customer={customer} />
              {columns.includes('phone') ? (
                <p className="font-mono text-text-muted">{customerPhone(customer)}</p>
              ) : null}
            </div>
            <TypePill customer={customer} />
          </div>
          {withOrders ? (
            <p className="text-sm text-text-muted tabular-nums">
              {customer.ordersCount} {customer.ordersCount === 1 ? 'order' : 'orders'} ·{' '}
              <span className="font-medium text-text">{formatMoney(customer.netSpendPoisha)}</span>{' '}
              · Last purchase <LastPurchase customer={customer} />
            </p>
          ) : null}
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

// Initials sit on a soft tint picked from the name, so the same person keeps the same colour.
const avatarTints = [
  'bg-primary-soft text-action-hover',
  'bg-info-soft text-info',
  'bg-success-soft text-success',
  'bg-ai-soft text-ai',
  'bg-warning-soft text-warning',
  'bg-danger-soft text-danger',
];

function Avatar({ name }: { name: string | null }) {
  const label = name ?? 'No name';
  const tint =
    avatarTints[[...label].reduce((sum, char) => sum + char.charCodeAt(0), 0) % avatarTints.length];
  return (
    <span
      aria-hidden="true"
      className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${tint}`}
    >
      {initialsOf(label)}
    </span>
  );
}

function TypePill({ customer }: { customer: ContactListItemResponse }) {
  const { label, variant } = customerTypePill(customer);
  return (
    <Badge variant={variant} className="whitespace-nowrap">
      {label}
    </Badge>
  );
}

function LastPurchase({ customer }: { customer: ContactListItemResponse }) {
  return customer.lastOrderAt ? (
    <time dateTime={customer.lastOrderAt}>{formatShortDate(customer.lastOrderAt)}</time>
  ) : (
    <Missing>No orders</Missing>
  );
}

function CustomerLink({ customer }: { customer: ContactListItemResponse }) {
  return (
    <Link
      href={`/customers/${customer.id}`}
      className="inline-flex min-h-10 items-center text-sm font-semibold whitespace-nowrap text-text hover:text-action hover:underline"
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
  phone: ({ customer }) => (
    <span className="font-mono tracking-tight">{customerPhone(customer)}</span>
  ),
  // Messages go to the WhatsApp number, or the phone when none is set.
  whatsapp: ({ customer }) => {
    const number = customer.whatsappPhone ?? customer.phone;
    return number ? (
      <span className="font-mono tracking-tight">{formatPhone(number)}</span>
    ) : (
      <Missing>No number</Missing>
    );
  },
  email: ({ customer }) => customer.email ?? <Missing>No email</Missing>,
  location: ({ customer }) => customer.district ?? <Missing>No location</Missing>,
  source: ({ customer }) => contactSourceLabels[customer.source],
  tags: ({ customer }) =>
    customer.tags.length ? (
      <CustomerTags tags={customer.tags} variant="neutral" />
    ) : (
      <Missing>No tags</Missing>
    ),
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
