'use client';
import { FormProvider, useForm } from 'react-hook-form';

import { Button } from '@dakly/ui/button';

import { useCreateCustomer } from '../api/create-customer';
import { isPhoneTaken } from '../customer-errors';
import { AddressFields, ExtraFields, PersonFields } from './contact-fields';
import {
  type ContactFormValues,
  contactFormResolver,
  emptyContactValues,
  toInput,
} from './contact-form-values';

type ContactFormProps = { onAdded: () => void; onCancel: () => void };

export function ContactForm({ onAdded, onCancel }: ContactFormProps) {
  const form = useForm<ContactFormValues>({
    resolver: contactFormResolver,
    defaultValues: emptyContactValues,
  });
  const createContact = useCreateCustomer();

  const onSubmit = form.handleSubmit((values) =>
    createContact.mutate(toInput(values), {
      onSuccess: onAdded,
      onError: (error) => {
        if (isPhoneTaken(error)) form.setError('phone', { message: error.message });
      },
    }),
  );

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <PersonFields />
        <hr className="border-border" />
        <AddressFields />
        <hr className="border-border" />
        <ExtraFields />
        {createContact.error && !isPhoneTaken(createContact.error) ? (
          <p role="alert" className="text-danger">
            {createContact.error.message}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" loading={createContact.isPending}>
            Save contact
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
