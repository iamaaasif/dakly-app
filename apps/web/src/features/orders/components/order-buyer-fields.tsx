import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

import type { ContactListResponse, ContactResponse } from '@dakly/contracts/contacts';
import type { CreateOrderValues } from '@dakly/contracts/orders';
import { bdMobileSchema } from '@dakly/contracts/phone';
import { Button } from '@dakly/ui/button';
import { Checkbox } from '@dakly/ui/checkbox';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';

import { useSessionContext } from '@/lib/session-context';
import { useStoreRequest } from '@/lib/store-request';

export function OrderBuyerFields() {
  const [selected, setSelected] = useState<ContactResponse | null>(null);
  const form = useFormContext<CreateOrderValues>();
  const { data } = useSessionContext();
  const isBuyer = useWatch({ control: form.control, name: 'recipient.isBuyer' });

  function populateRecipient(contact: ContactResponse | null) {
    const name = contact ? (contact.name ?? '') : form.getValues('buyer.name');
    const phone = contact
      ? bdMobileSchema.safeParse(contact.phone).data
      : form.getValues('buyer.phone');
    form.setValue('recipient.name', name);
    form.setValue('recipient.phone', phone ?? '');
  }

  function choose(contact: ContactResponse | null) {
    setSelected(contact);
    form.unregister('buyer');
    form.setValue('buyer', contact ? { contactId: contact.id } : { name: '' });
    if (form.getValues('recipient.isBuyer')) populateRecipient(contact);
  }

  return (
    <>
      {selected ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-muted p-2">
          <span>Buyer {selected.name ?? 'Unnamed customer'}</span>
          <Button variant="secondary" onClick={() => choose(null)}>
            Change buyer
          </Button>
        </div>
      ) : (
        <>
          {data?.currentStore?.canViewCustomers && <BuyerSearch onChoose={choose} />}
          <BuyerEntry />
        </>
      )}
      <div className="flex min-h-10 items-center gap-3 pl-2">
        <Checkbox
          id="different-recipient"
          checked={!isBuyer}
          onCheckedChange={(different) => {
            form.setValue('recipient.isBuyer', different !== true);
            if (different) {
              form.setValue('recipient.name', '');
              form.setValue('recipient.phone', '');
            } else populateRecipient(selected);
          }}
        />
        <label htmlFor="different-recipient">Deliver to someone else</label>
      </div>
    </>
  );
}

function BuyerSearch({ onChoose }: { onChoose: (contact: ContactResponse) => void }) {
  const [search, setSearch] = useState('');
  const { contextTag, request } = useStoreRequest();
  const term = search.trim();
  const customers = useQuery({
    queryKey: ['order-buyers', contextTag, term],
    queryFn: ({ signal }) =>
      request<ContactListResponse>(
        `/contacts?${new URLSearchParams({ limit: '20', search: term })}`,
        { signal },
      ),
    enabled: Boolean(contextTag && term.length >= 3),
    retry: false,
  });

  return (
    <>
      <label className="block">
        Find a customer
        <Input value={search} maxLength={120} onChange={(event) => setSearch(event.target.value)} />
      </label>
      {customers.data && (
        <div
          className="flex max-h-32 flex-wrap gap-2 overflow-y-auto"
          aria-label="Matching customers"
        >
          {customers.data.items.map((contact) => (
            <Button key={contact.id} variant="secondary" onClick={() => onChoose(contact)}>
              {contact.name ?? 'Unnamed customer'} {contact.phone}
            </Button>
          ))}
          {customers.data.items.length === 0 && (
            <p className="text-sm text-text-muted">No matching customers</p>
          )}
        </div>
      )}
      {customers.error && (
        <p className="text-danger" role="alert">
          {customers.error.message}
        </p>
      )}
    </>
  );
}

function BuyerEntry() {
  const { getValues, register, setValue } = useFormContext<CreateOrderValues>();
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <FormField name="buyer.name" label="Buyer name">
        {(props) => (
          <Input
            {...props}
            {...register('buyer.name', {
              onBlur: (event) => {
                const recipient = getValues('recipient');
                if (recipient.isBuyer && !recipient.name)
                  setValue('recipient.name', event.target.value);
              },
            })}
          />
        )}
      </FormField>
      <FormField name="buyer.phone" label="Buyer phone (optional)">
        {(props) => (
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="text-text-muted">
              +880
            </span>
            <Input
              {...props}
              type="tel"
              {...register('buyer.phone', {
                setValueAs: (value: string) => value.trim() || undefined,
                onBlur: (event) => {
                  const recipient = getValues('recipient');
                  if (recipient.isBuyer && !recipient.phone)
                    setValue('recipient.phone', event.target.value);
                },
              })}
            />
          </div>
        )}
      </FormField>
    </div>
  );
}
