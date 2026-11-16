import { zodResolver } from '@hookform/resolvers/zod';
import { FormProvider, useForm } from 'react-hook-form';

import {
  type ContactResponse,
  type UpdateContactInput,
  updateContactSchema,
} from '@dakly/contracts/contacts';
import { Button } from '@dakly/ui/button';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';

import { useUpdateCustomer } from '../api/update-customer';
import { isPhoneTaken } from '../customer-errors';
import { customerPhone } from '../customer-labels';
import { formError } from '@/lib/form-error';

type CustomerEditFormProps = { customer: ContactResponse; onDone: () => void };

const optional = { setValueAs: (value: string) => value.trim() || undefined };
const tagList = {
  setValueAs: (value: string) =>
    value
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
};

const fieldMessages: Record<string, string> = {
  name: 'Enter a customer name, up to 120 characters.',
  tags: 'Use up to 50 tags, each up to 50 characters.',
};

export function CustomerEditForm({ customer, onDone }: CustomerEditFormProps) {
  const form = useForm<UpdateContactInput>({
    resolver: zodResolver(updateContactSchema, {
      error: (issue) => fieldMessages[String(issue.path?.[0])],
    }),
    defaultValues: { name: customer.name ?? undefined },
  });
  const update = useUpdateCustomer(customer.id);
  const onSubmit = form.handleSubmit((change) =>
    update.mutate(change, {
      onSuccess: onDone,
      onError: (error) => {
        if (isPhoneTaken(error)) form.setError('phone', { message: error.message });
        else formError(error, form.setError);
      },
    }),
  );
  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="space-y-4">
        <FormField name="name" label="Name">
          {(control) => <Input {...control} {...form.register('name', optional)} />}
        </FormField>
        {/* The phone may arrive masked, so it starts empty and is sent only when typed. */}
        <FormField
          name="phone"
          label="New mobile number"
          hint={`Leave empty to keep ${customerPhone(customer)}`}
        >
          {(control) => (
            <Input
              {...control}
              {...form.register('phone', optional)}
              type="tel"
              autoComplete="off"
            />
          )}
        </FormField>
        <FormField name="tags" label="Tags" hint="Separate tags with commas">
          {(control) => (
            <Input
              {...control}
              {...form.register('tags', tagList)}
              defaultValue={customer.tags.join(', ')}
            />
          )}
        </FormField>
        {form.formState.errors.root ? (
          <p role="alert" className="text-danger">
            {form.formState.errors.root.message}
          </p>
        ) : null}
        <Button type="submit" loading={update.isPending}>
          Save customer
        </Button>
      </form>
    </FormProvider>
  );
}
