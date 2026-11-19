import { useState } from 'react';
import { useFormContext, useWatch, type UseFormReturn } from 'react-hook-form';

import type { ContactResponse } from '@dakly/contracts/contacts';
import type { CreateOrderValues } from '@dakly/contracts/orders';
import { bdMobileSchema } from '@dakly/contracts/phone';
import { Button } from '@dakly/ui/button';
import { Checkbox } from '@dakly/ui/checkbox';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';

import { useOrderBuyers } from '../api/order-buyers';
import { useSessionContext } from '@/lib/session-context';

export function OrderBuyerFields() {
  const [search, setSearch] = useState('');
  const form = useFormContext<CreateOrderValues>();
  const [isBuyer, buyer] = useWatch({
    control: form.control,
    name: ['recipient.isBuyer', 'buyer'],
  });
  const selectedId = buyer && 'contactId' in buyer ? buyer.contactId : undefined;
  const customers = useOrderBuyers(search.trim());
  const selected = customers.data?.items.find(({ id }) => id === selectedId);

  function populateRecipient(contact: ContactResponse | null) {
    const name = contact ? (contact.name ?? '') : form.getValues('buyer.name');
    const phone = contact
      ? bdMobileSchema.safeParse(contact.phone).data
      : form.getValues('buyer.phone');
    const options = { shouldValidate: form.formState.isSubmitted };
    form.setValue('recipient.name', name, options);
    form.setValue('recipient.phone', phone ?? '', options);
  }

  function choose(contact: ContactResponse | null) {
    form.unregister('buyer');
    form.setValue('buyer', contact ? { contactId: contact.id } : { name: '' });
    if (form.getValues('recipient.isBuyer')) populateRecipient(contact);
  }

  function chooseRecipient(different: boolean) {
    form.setValue('recipient.isBuyer', !different);
    if (!different) return populateRecipient(selected ?? null);
    keepTypedBuyer(form);
    form.setValue('recipient.name', '');
    form.setValue('recipient.phone', '');
  }

  return (
    <>
      <div className="flex flex-wrap items-start gap-2">
        {selectedId ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-muted p-2">
            <span>Buyer {selected?.name ?? 'Unnamed customer'}</span>
            <Button variant="secondary" onClick={() => choose(null)}>
              Change buyer
            </Button>
          </div>
        ) : (
          <BuyerSearch {...{ search, setSearch, customers }} onChoose={choose} />
        )}
        <div className="flex min-h-10 items-center gap-3 pl-2">
          <Checkbox
            id="different-recipient"
            checked={!isBuyer}
            onCheckedChange={(different) => chooseRecipient(different === true)}
          />
          <label htmlFor="different-recipient">Deliver to someone else</label>
        </div>
      </div>
      {!selectedId && isBuyer === false && <BuyerEntry />}
    </>
  );
}

function keepTypedBuyer(form: UseFormReturn<CreateOrderValues>) {
  const { buyer, recipient } = form.getValues();
  if ('contactId' in buyer) return;
  form.setValue('buyer', { name: recipient.name, phone: recipient.phone || undefined });
}

type BuyerSearchProps = {
  search: string;
  setSearch: (search: string) => void;
  customers: ReturnType<typeof useOrderBuyers>;
  onChoose: (contact: ContactResponse) => void;
};

function BuyerSearch({ search, setSearch, customers, onChoose }: BuyerSearchProps) {
  const { data } = useSessionContext();
  if (!data?.currentStore?.canViewCustomers) return null;
  return (
    <details className="space-y-2">
      <summary className="min-h-10 w-fit min-w-10 cursor-pointer leading-10 text-action focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
        Find a customer
      </summary>
      <label className="block">
        Customer name or phone
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
    </details>
  );
}

function BuyerEntry() {
  const { register } = useFormContext<CreateOrderValues>();
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <FormField name="buyer.name" label="Buyer name">
        {(props) => <Input {...props} {...register('buyer.name')} />}
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
              })}
            />
          </div>
        )}
      </FormField>
    </div>
  );
}
