'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type MouseEvent, type ReactNode, useState } from 'react';

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
import { CustomerBulkBar } from './customer-bulk-bar';
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

// The checkbox and name columns stay at the left edge while the other columns scroll under them.
const stickyCheckbox = 'sticky left-0 z-[1]';
const stickyName = 'sticky left-9 z-[1] border-r border-border';

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
  const chosen = customers.filter((customer) => selected.has(customer.id));
  return (
    <div className="relative hidden md:block">
      {/* The box scrolls both ways, so the header and the name column stay in view. */}
      <Table
        bare
        className="text-xs"
        containerClassName="max-h-[calc(100dvh-19rem)] min-h-64 overflow-auto"
      >
        <CustomerTableHead
          columns={columns}
          withOrders={withOrders}
          selectAll={selectAllState(customers, selected)}
          onSelectAll={(on) => choose(on ? new Set(customers.map((each) => each.id)) : new Set())}
        />
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
      {chosen.length ? (
        <CustomerBulkBar selected={chosen} onClear={() => choose(new Set())} />
      ) : null}
    </div>
  );
}

type CustomerTableHeadProps = {
  columns: CustomerColumn[];
  withOrders: boolean;
  selectAll: boolean | 'indeterminate';
  onSelectAll: (on: boolean) => void;
};

function CustomerTableHead({
  columns,
  withOrders,
  selectAll,
  onSelectAll,
}: CustomerTableHeadProps) {
  return (
    <TableHeader className="sticky top-0 z-10 bg-surface-muted">
      <TableRow className="hover:bg-transparent">
        <TableHead className={`${stickyCheckbox} w-9 bg-surface-muted pr-0 pl-3`}>
          <Checkbox
            aria-label="Select all customers on this page"
            checked={selectAll}
            onCheckedChange={(on) => onSelectAll(on === true)}
          />
        </TableHead>
        <TableHead className={`${headClass} ${stickyName} bg-surface-muted`}>Customer</TableHead>
        <ColumnHeads columns={columns} list={leadingColumns} />
        <TableHead className={headClass}>Type</TableHead>
        {withOrders ? <OrderHeads /> : null}
        <ColumnHeads columns={columns} list={trailingColumns} />
      </TableRow>
    </TableHeader>
  );
}

type CustomerTableRowProps = {
  customer: ContactListItemResponse;
  columns: CustomerColumn[];
  selected: boolean;
  withOrders: boolean;
  onToggle: (on: boolean) => void;
};

// A click anywhere on the row opens the profile; Ctrl or Cmd opens it in a new tab.
function useOpenProfile(customerId: string) {
  const router = useRouter();
  return (event: MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    // Buttons, links and checkboxes inside the row keep their own action.
    if (target.closest('a, button, input, [role="checkbox"]') || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey) window.open(`/customers/${customerId}`, '_blank');
    else router.push(`/customers/${customerId}`);
  };
}

function CustomerTableRow({
  customer,
  columns,
  selected,
  withOrders,
  onToggle,
}: CustomerTableRowProps) {
  const open = useOpenProfile(customer.id);
  return (
    <TableRow
      data-state={selected ? 'selected' : undefined}
      onClick={open}
      className="cursor-pointer bg-surface focus-within:bg-surface-hover hover:bg-surface-hover data-[state=selected]:bg-primary-soft"
    >
      <TableCell className={`${stickyCheckbox} bg-inherit pr-0 pl-3`}>
        <Checkbox
          aria-label={`Select ${customer.name ?? 'No name'}`}
          checked={selected}
          onCheckedChange={(on) => onToggle(on === true)}
        />
      </TableCell>
      <TableCell className={`${stickyName} bg-inherit px-1.5`}>
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
        <MobileRow key={customer.id} customer={customer}>
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
        </MobileRow>
      ))}
    </ul>
  );
}

function MobileRow({
  customer,
  children,
}: {
  customer: ContactListItemResponse;
  children: ReactNode;
}) {
  const open = useOpenProfile(customer.id);
  return (
    <li onClick={open} className="cursor-pointer space-y-2 p-4 active:bg-surface-hover">
      {children}
    </li>
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
