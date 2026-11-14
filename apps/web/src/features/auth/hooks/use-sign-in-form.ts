import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { passwordSignInSchema, passwordIdentifierSchema } from '@dakly/contracts/auth';
import { usePasswordSignIn } from '../api/password-sign-in';
import { useRequestCode } from '../api/request-code';
import { useRequestEmailCode } from '../api/request-email-code';
import { formError } from '../form-error';
export function useSignInForm(method: 'phone' | 'email', isRemembered: boolean) {
  const [codeTarget, setCodeTarget] = useState<{
    identifier: string;
    isRemembered: boolean;
  } | null>(null);
  const form = useForm({
    resolver: zodResolver(passwordSignInSchema),
    defaultValues: { identifier: '', password: '', isRemembered },
  });
  const password = usePasswordSignIn();
  const phoneCode = useRequestCode();
  const emailCode = useRequestEmailCode();
  const pending = password.isPending || phoneCode.isPending || emailCode.isPending;
  async function requestCode() {
    form.clearErrors();
    const input = passwordIdentifierSchema.safeParse({ identifier: form.getValues('identifier') });
    if (!input.success) {
      form.setError('identifier', {
        message:
          method === 'phone'
            ? 'Enter a valid Bangladeshi mobile number.'
            : 'Enter your email address.',
      });
      form.setFocus('identifier');
      return;
    }
    try {
      if (method === 'phone')
        await phoneCode.mutateAsync({ purpose: 'sign_in', phone: input.data.identifier });
      else await emailCode.mutateAsync({ email: input.data.identifier });
      setCodeTarget({
        identifier: input.data.identifier,
        isRemembered: Boolean(form.getValues('isRemembered')),
      });
      form.resetField('password');
    } catch (error) {
      formError(error, form.setError);
    }
  }
  return { form, password, pending, codeTarget, setCodeTarget, requestCode };
}
