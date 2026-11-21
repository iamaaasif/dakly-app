'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, FormProvider, useForm, useFormContext } from 'react-hook-form';
import { z } from 'zod';

import { collectPaymentSchema, type DueListCustomerResponse } from '@dakly/contracts/due-book';
import { formatMoney } from '@dakly/contracts/money';
import { takaInput } from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';
import { cn } from '@dakly/ui/cn';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';
import { useToast } from '@dakly/ui/toast';

import { useCollectPayment } from '../api/collect-payment';
import { collectMethods } from '../due-labels';
import { SessionDialog } from '@/components/session-dialog';
import { formError } from '@/lib/form-error';
import { takaInputFromPoisha } from '@/lib/format-money';

const collectFormSchema = z.object({
  amountPoisha: takaInput,
  method: collectPaymentSchema.shape.method,
});
type Values = z.input<typeof collectFormSchema>;
type Output = z.output<typeof collectFormSchema>;

type CollectDialogProps = { customer: DueListCustomerResponse; onClose: () => void };

export function CollectDialog({ customer, onClose }: CollectDialogProps) {
  const form = useForm<Values, undefined, Output>({
    resolver: zodResolver(collectFormSchema),
    defaultValues: {
      amountPoisha: takaInputFromPoisha(customer.balancePoisha).replace(/\.00$/, ''),
      method: 'cash',
    },
  });
  const collect = useCollectPayment(customer.contactId);
  const showToast = useToast();
  const name = customer.name ?? customer.phone ?? 'customer';

  const submit = form.handleSubmit((input) =>
    collect.mutate(input, {
      onSuccess: () => {
        showToast(`Payment recorded from ${name}.`);
        onClose();
      },
      onError: (error) => formError(error, form.setError),
    }),
  );

  return (
    <SessionDialog
      open
      title={`Collect from ${name}`}
      onClose={onClose}
      closeDisabled={collect.isPending}
    >
      <FormProvider {...form}>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <p className="font-medium text-danger">Owes {formatMoney(customer.balancePoisha)}</p>
          <fieldset disabled={collect.isPending} className="min-w-0 space-y-4">
            <CollectFields />
          </fieldset>
          {form.formState.errors.root && (
            <p role="alert" className="text-danger">
              {form.formState.errors.root.message}
            </p>
          )}
          <div className="flex justify-end border-t border-border pt-4">
            <Button type="submit" loading={collect.isPending}>
              Record payment
            </Button>
          </div>
        </form>
      </FormProvider>
    </SessionDialog>
  );
}

function CollectFields() {
  const { register, control } = useFormContext<Values>();
  return (
    <>
      <FormField name="amountPoisha" label="Amount received (৳)">
        {(field) => <Input {...field} {...register('amountPoisha')} inputMode="decimal" />}
      </FormField>
      <Controller
        control={control}
        name="method"
        render={({ field }) => (
          <div role="radiogroup" aria-label="Payment method" className="flex flex-wrap gap-2">
            {collectMethods.map(({ method, label }) => (
              <button
                key={method}
                type="button"
                role="radio"
                aria-checked={field.value === method}
                onClick={() => field.onChange(method)}
                className={cn(
                  'min-h-10 rounded-full border px-4 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                  field.value === method
                    ? 'border-inverse bg-inverse text-on-primary'
                    : 'border-border-strong bg-surface hover:bg-surface-muted',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      />
    </>
  );
}
