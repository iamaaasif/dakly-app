'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronRight } from 'lucide-react';
import { useForm } from 'react-hook-form';

import { passwordIdentifierSchema } from '@dakly/contracts/auth';
import { Button } from '@dakly/ui/button';

import { useRequestReset } from '../api/request-reset';
import { authButtonClass, authFieldClass } from './auth-control-class';
import { FormField as AuthField } from '@/components/form-field';
import { formError } from '@/lib/form-error';

export function ResetEmailStep({ onSent }: { onSent: (identifier: string) => void }) {
  const form = useForm({
    resolver: zodResolver(passwordIdentifierSchema),
    defaultValues: { identifier: '' },
  });
  const request = useRequestReset();
  const errors = form.formState.errors;
  return (
    <form
      method="post"
      className="space-y-4.5"
      onSubmit={form.handleSubmit(async (input) => {
        try {
          await request.mutateAsync(input);
          onSent(input.identifier);
        } catch (error) {
          formError(error, form.setError);
        }
      })}
    >
      {/* Accounts made with a mobile number only can still enter it here. */}
      <AuthField
        label="Email"
        field={form.register('identifier')}
        error={errors.identifier}
        autoComplete="username"
        placeholder="you@business.com"
        className={authFieldClass}
      />
      {errors.root ? (
        <p role="alert" className="text-danger">
          {errors.root.message}
        </p>
      ) : null}
      <Button type="submit" loading={request.isPending} className={authButtonClass}>
        Send code
        <ChevronRight aria-hidden="true" size={16} />
      </Button>
    </form>
  );
}
