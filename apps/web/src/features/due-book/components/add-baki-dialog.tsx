'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormProvider, useForm, useFormContext } from 'react-hook-form';
import { z } from 'zod';

import { recordBakiSchema } from '@dakly/contracts/due-book';
import { bdMobileSchema } from '@dakly/contracts/phone';
import { takaInput } from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';
import { useToast } from '@dakly/ui/toast';

import { useRecordBaki } from '../api/record-baki';
import { SessionDialog } from '@/components/session-dialog';
import { formError } from '@/lib/form-error';

const addBakiFormSchema = z.object({
  phone: bdMobileSchema,
  name: z.string().trim().min(1, 'Enter the customer name').max(120),
  amountPoisha: takaInput,
  note: z
    .string()
    .trim()
    .max(500)
    .transform((value) => value || undefined)
    .pipe(recordBakiSchema.shape.note),
});
type Values = z.input<typeof addBakiFormSchema>;
type Output = z.output<typeof addBakiFormSchema>;

type AddBakiDialogProps = { onClose: () => void };

export function AddBakiDialog({ onClose }: AddBakiDialogProps) {
  const form = useForm<Values, undefined, Output>({
    resolver: zodResolver(addBakiFormSchema),
    defaultValues: { phone: '', name: '', amountPoisha: '', note: '' },
  });
  const recordBaki = useRecordBaki();
  const showToast = useToast();

  const submit = form.handleSubmit((input) =>
    recordBaki.mutate(input, {
      onSuccess: () => {
        showToast('Baki added.');
        onClose();
      },
      onError: (error) => formError(error, form.setError),
    }),
  );

  return (
    <SessionDialog open title="Add baki" onClose={onClose} closeDisabled={recordBaki.isPending}>
      <FormProvider {...form}>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <p className="text-text-muted">Copy old dues from your notebook, or add one by hand.</p>
          <fieldset disabled={recordBaki.isPending} className="min-w-0 space-y-4">
            <AddBakiFields />
          </fieldset>
          {form.formState.errors.root && (
            <p role="alert" className="text-danger">
              {form.formState.errors.root.message}
            </p>
          )}
          <div className="flex justify-end border-t border-border pt-4">
            <Button type="submit" loading={recordBaki.isPending}>
              Add baki
            </Button>
          </div>
        </form>
      </FormProvider>
    </SessionDialog>
  );
}

function AddBakiFields() {
  const { register } = useFormContext<Values>();
  return (
    <>
      <FormField name="phone" label="Phone">
        {(control) => (
          <Input
            {...control}
            {...register('phone')}
            type="tel"
            autoComplete="off"
            placeholder="01712-345678"
          />
        )}
      </FormField>
      <FormField name="name" label="Name">
        {(control) => <Input {...control} {...register('name')} autoComplete="off" />}
      </FormField>
      <FormField name="amountPoisha" label="Amount they owe (৳)">
        {(control) => <Input {...control} {...register('amountPoisha')} inputMode="decimal" />}
      </FormField>
      <FormField name="note" label="Note">
        {(control) => <Input {...control} {...register('note')} placeholder="e.g. 2 shirts, Eid" />}
      </FormField>
    </>
  );
}
