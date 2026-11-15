'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { passwordIdentifierSchema } from '@dakly/contracts/auth';
import { Button } from '@dakly/ui/button';
import { useRequestReset } from '../api/request-reset';
import { formError } from '@/lib/form-error';
import { AuthFrame } from './auth-frame';
import { FormField as AuthField } from '@/components/form-field';
import { PasswordResetConfirm } from './password-reset-confirm';
export function PasswordReset() {
  const [identifier, setIdentifier] = useState<string>();
  const form = useForm({
    resolver: zodResolver(passwordIdentifierSchema),
    defaultValues: { identifier: '' },
  });
  const request = useRequestReset();
  return (
    <AuthFrame title="Reset your password">
      {identifier ? (
        <PasswordResetConfirm identifier={identifier} />
      ) : (
        <form
          method="post"
          className="space-y-4"
          onSubmit={form.handleSubmit(async (input) => {
            try {
              await request.mutateAsync(input);
              setIdentifier(input.identifier);
            } catch (error) {
              formError(error, form.setError);
            }
          })}
        >
          <AuthField
            label="Mobile number or email"
            field={form.register('identifier')}
            error={form.formState.errors.identifier}
            autoComplete="username"
          />
          {form.formState.errors.root ? (
            <p role="alert" className="text-danger">
              {form.formState.errors.root.message}
            </p>
          ) : null}
          <Button type="submit" loading={request.isPending}>
            Send reset code
          </Button>
        </form>
      )}
    </AuthFrame>
  );
}
