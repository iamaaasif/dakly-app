'use client';
import { useEffect, useRef } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

import type { CreateOrderValues } from '@dakly/contracts/orders';
import { bdMobileSchema } from '@dakly/contracts/phone';
import { cn } from '@dakly/ui/cn';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';

import { useOrderBuyers } from '../api/order-buyers';
import { filledClass } from '../new-order-fields';
import type { Customer } from '../use-customer-fill';
import { useOrderCustomerLookup } from '@/lib/order-entry/customer-lookup';
import { useDebouncedValue } from '@/lib/use-debounced-value';

type PhoneFieldProps = {
  name: 'recipient.phone' | 'buyer.phone';
  filled: boolean;
  separate: boolean;
  picked: string | undefined;
  onPick: (contactId: string | undefined) => void;
  onCustomer: (customer: Customer, force: boolean) => void;
  onEdit: () => void;
};

function lookupQuery({
  separate,
  picked,
  phone,
}: {
  separate: boolean;
  picked?: string;
  phone?: string;
}) {
  if (separate) return undefined;
  if (picked) return { contactId: picked };
  return phone ? { phone } : undefined;
}

// Links the customer a lookup found to the form once, and drops the link when the number changes
// to one nobody owns.
function useLinkedCustomer(
  props: PhoneFieldProps,
  lookup: ReturnType<typeof useOrderCustomerLookup>,
) {
  const { picked, onCustomer } = props;
  const form = useFormContext<CreateOrderValues>();
  const applied = useRef<string | undefined>(undefined);
  const customer = lookup.data?.customer;
  useEffect(() => {
    if (!customer || applied.current === customer.contactId) return;
    applied.current = customer.contactId;
    onCustomer(customer, Boolean(picked));
    // The callbacks are new each render; the customer found is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.contactId]);
  useEffect(() => {
    if (!lookup.data || lookup.data.customer || !applied.current) return;
    applied.current = undefined;
    form.setValue('buyer', { name: '' });
  }, [lookup.data, form]);
  return () => {
    applied.current = undefined;
  };
}

// Finds the customer as the number is typed: a full number looks them up, a start lists matches.
function usePhoneLookup(props: PhoneFieldProps) {
  const { name, separate, picked } = props;
  const form = useFormContext<CreateOrderValues>();
  const value = useWatch({ control: form.control, name }) ?? '';
  const typed = useDebouncedValue(value.trim(), 250);
  const valid = bdMobileSchema.safeParse(typed);
  const lookup = useOrderCustomerLookup(
    lookupQuery({ separate, picked, phone: valid.success ? valid.data : undefined }),
  );
  const suggestions = useOrderBuyers(separate || valid.success ? '' : typed);
  const forget = useLinkedCustomer(props, lookup);
  return {
    customer: lookup.data?.customer,
    openOrders: lookup.data?.openOrders ?? 0,
    matches: suggestions.data?.items ?? [],
    forget,
  };
}

export function OrderPhoneField(props: PhoneFieldProps) {
  const { name, filled, onPick, onEdit } = props;
  const form = useFormContext<CreateOrderValues>();
  const { customer, openOrders, matches, forget } = usePhoneLookup(props);
  return (
    <div className="relative space-y-1.5">
      <FormField name={name} label="Phone">
        {(field) => (
          <Input
            {...field}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="01712-345678"
            className={cn(filled && filledClass)}
            {...form.register(name, {
              setValueAs: (text: string) => text.trim(),
              onChange: () => {
                onPick(undefined);
                onEdit();
              },
            })}
          />
        )}
      </FormField>
      {matches.length > 0 && !customer && (
        <PhoneMatches
          matches={matches}
          onPick={(id) => {
            forget();
            onPick(id);
          }}
        />
      )}
      {customer && (
        <p role="status" className="text-sm text-success">
          Returning customer {customer.name ?? ''}. Details filled in.
        </p>
      )}
      {openOrders > 0 && (
        <p role="status" className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
          {openOrders} open {openOrders === 1 ? 'order' : 'orders'} already go to this number.
        </p>
      )}
    </div>
  );
}

type Match = { id: string; name: string | null; phone: string | null };

function PhoneMatches({ matches, onPick }: { matches: Match[]; onPick: (id: string) => void }) {
  return (
    <ul
      role="listbox"
      aria-label="Matching customers"
      className="motion-popover absolute inset-x-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-overlay"
      data-state="open"
    >
      {matches.map((contact) => (
        <li key={contact.id} role="option" aria-selected="false">
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(contact.id)}
            className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus"
          >
            <span className="truncate">{contact.name ?? 'Unnamed customer'}</span>
            <span className="text-sm text-text-muted tabular-nums">{contact.phone}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
