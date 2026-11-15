'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';

import { staffTotpSchema, type StaffTotpInput } from '@dakly/contracts/staff-auth';
import { Button } from '@dakly/ui/button';
import { Input } from '@dakly/ui/input';

import { useVerifyTotp } from '../api/verify-totp';

type TotpFormProps = { challenge: string };
export function TotpForm({ challenge }: TotpFormProps) {
  const router = useRouter();
  const verify = useVerifyTotp();
  const form = useForm<StaffTotpInput>({
    resolver: zodResolver(staffTotpSchema),
    defaultValues: { challenge, code: '' },
  });
  return (
    <form
      method="post"
      className="space-y-4"
      onSubmit={form.handleSubmit((input) =>
        verify.mutate(input, { onSuccess: () => router.replace('/') }),
      )}
    >
      <label className="grid gap-2 font-medium">
        Authenticator code
        <Input
          {...form.register('code')}
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-invalid={Boolean(form.formState.errors.code)}
          aria-describedby="code-error"
        />
      </label>
      <p id="code-error" className="text-danger" role="alert">
        {form.formState.errors.code
          ? 'Enter the six-digit code from your authenticator.'
          : verify.error?.message}
      </p>
      <Button type="submit" loading={verify.isPending} className="w-full">
        Verify and sign in
      </Button>
    </form>
  );
}
