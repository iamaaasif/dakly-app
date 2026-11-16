import { zodResolver } from '@hookform/resolvers/zod';
import { FormProvider, useForm } from 'react-hook-form';

import { type RecordConsentInput, recordConsentSchema } from '@dakly/contracts/contacts';
import { ApiError } from '@dakly/ui/api-client';
import { Badge } from '@dakly/ui/badge';
import { Button } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';
import { FormField } from '@dakly/ui/form-field';
import { Textarea } from '@dakly/ui/textarea';

import { useRecordConsent } from '../api/record-consent';
import { ConsentChoiceFields } from './consent-choice-fields';
import { formError } from '@/lib/form-error';

type ConsentFormProps = { contactId: string };

export function ConsentForm({ contactId }: ConsentFormProps) {
  const form = useForm<RecordConsentInput>({
    resolver: zodResolver(recordConsentSchema, {
      error: (issue) =>
        issue.path?.[0] === 'note'
          ? 'Write how the customer told you, up to 500 characters.'
          : undefined,
    }),
    defaultValues: { channel: 'whatsapp', status: 'granted', note: '' },
  });
  const record = useRecordConsent(contactId);
  const onSubmit = form.handleSubmit((input) =>
    record.mutate(input, {
      onSuccess: () => form.reset(),
      onError: (error) => {
        if (error instanceof ApiError && error.code === 'CONSENT_OPT_IN_NEEDS_CUSTOMER')
          form.setError('status', { message: error.message });
        else formError(error, form.setError);
      },
    }),
  );
  return (
    <Card className="space-y-4">
      <h2 className="text-md font-semibold">Marketing permission</h2>
      <FormProvider {...form}>
        <form onSubmit={onSubmit} className="space-y-4">
          <ConsentChoiceFields />
          <FormField name="note" label="How they told you" hint="For example: said yes on a call">
            {(control) => <Textarea {...control} {...form.register('note')} />}
          </FormField>
          {form.formState.errors.root ? (
            <p role="alert" className="text-danger">
              {form.formState.errors.root.message}
            </p>
          ) : null}
          <Button type="submit" loading={record.isPending}>
            Save answer
          </Button>
          {record.isSuccess ? (
            <p role="status">
              <Badge variant="success">Answer saved</Badge>
            </p>
          ) : null}
        </form>
      </FormProvider>
    </Card>
  );
}
