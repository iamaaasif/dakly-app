import { zodResolver } from '@hookform/resolvers/zod';
import { useRef } from 'react';
import { Controller, FormProvider, useForm, type UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

import { requestSmsSenderIdSchema } from '@dakly/contracts/sms-senders';
import { Button } from '@dakly/ui/button';
import { Checkbox } from '@dakly/ui/checkbox';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';

import { useRequestSmsSender } from '../api/sms-sender-requests';
import { useUploadSmsSenderDocument } from '../api/upload-sms-sender-document';
import { SessionDialog as Dialog } from '@/components/session-dialog';
import { formError } from '@/lib/form-error';

const requestForm = requestSmsSenderIdSchema.extend({
  tradeLicenceFileId: z.uuid('Upload your trade licence'),
  nidFileId: z.uuid('Upload your NID'),
  ownsName: z.boolean().refine(Boolean, 'Confirm that you own this brand name'),
});
type RequestForm = z.infer<typeof requestForm>;

export function RequestSenderDialog({ onClose }: { onClose: () => void }) {
  const form = useForm<RequestForm>({
    resolver: zodResolver(requestForm),
    defaultValues: { senderName: '', tradeLicenceFileId: '', nidFileId: '', ownsName: false },
  });
  const request = useRequestSmsSender();
  return (
    <Dialog open title="Request a sender name" onClose={onClose}>
      <FormProvider {...form}>
        <form
          className="space-y-4"
          noValidate
          onSubmit={form.handleSubmit(async ({ ownsName: _ownsName, ...input }) => {
            try {
              await request.mutateAsync(input);
              onClose();
            } catch (error) {
              formError(error, form.setError);
            }
          })}
        >
          <p className="text-sm">
            Mobile operators in Bangladesh review every sender name. It usually takes about 7 days.
            Until then, SMS keep going out from the shared sender.
          </p>
          <SenderNameField form={form} />
          <DocumentField form={form} name="tradeLicenceFileId" label="Trade licence" />
          <DocumentField form={form} name="nidFileId" label="NID of the owner" />
          <OwnershipField form={form} />
          {form.formState.errors.root ? (
            <p role="alert" className="text-sm text-danger">
              {form.formState.errors.root.message}
            </p>
          ) : null}
          <div className="flex justify-end gap-3 border-t border-border pt-4">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={request.isPending}>
              Send request
            </Button>
          </div>
        </form>
      </FormProvider>
    </Dialog>
  );
}

function DocumentField({
  form,
  name,
  label,
}: {
  form: UseFormReturn<RequestForm>;
  name: 'tradeLicenceFileId' | 'nidFileId';
  label: string;
}) {
  const upload = useUploadSmsSenderDocument();
  const chosen = useRef<string>('');
  return (
    <FormField
      name={name}
      label={label}
      hint="PDF, JPEG or PNG, up to 5 MB. Only Dakly staff see it, and it is deleted once the operators decide."
    >
      {(control) => (
        <div className="space-y-1">
          <input
            {...control}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            className="block w-full text-sm file:mr-3 file:min-h-10 file:rounded-md file:border file:border-input-border file:bg-surface file:px-3 file:font-semibold"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              chosen.current = file.name;
              form.setValue(name, '', { shouldValidate: false });
              upload.mutate(file, {
                onSuccess: (fileId) => form.setValue(name, fileId, { shouldValidate: true }),
              });
            }}
          />
          {upload.isPending ? (
            <p role="status" className="text-sm">
              Uploading {chosen.current}…
            </p>
          ) : null}
          {upload.isSuccess ? (
            <p role="status" className="text-sm">
              {chosen.current} uploaded.
            </p>
          ) : null}
          {upload.error ? (
            <p role="alert" className="text-sm text-danger">
              {upload.error.message}
            </p>
          ) : null}
        </div>
      )}
    </FormField>
  );
}

function OwnershipField({ form }: { form: UseFormReturn<RequestForm> }) {
  return (
    <FormField name="ownsName" label="">
      {(control) => (
        <Controller
          control={form.control}
          name="ownsName"
          render={({ field }) => (
            <label className="flex items-start gap-3 text-sm">
              <Checkbox
                {...control}
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(checked === true)}
              />
              I own this brand name and can show a trade licence if asked.
            </label>
          )}
        />
      )}
    </FormField>
  );
}

function SenderNameField({ form }: { form: UseFormReturn<RequestForm> }) {
  return (
    <FormField
      name="senderName"
      label="Sender name"
      hint="3 to 11 English letters, numbers or spaces. Use your store or brand name."
    >
      {(control) => (
        <Input
          {...control}
          {...form.register('senderName')}
          maxLength={11}
          placeholder="e.g. URBANTREND"
          className="font-mono"
        />
      )}
    </FormField>
  );
}
