'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { totpRecoveryFieldsSchema, type TotpRecoveryResponse } from '@dakly/contracts/totp';

import { useRequestRecoveryCode } from '../api/request-recovery-code';
import { useStartRecovery } from '../api/start-recovery';
import { formError } from '@/lib/form-error';

const optional = (schema: z.ZodType<string | undefined>) =>
  z.union([schema, z.literal('').transform(() => undefined)]);
const recoverySchema = z.object({
  identifier: z.string().trim().min(1, 'Enter your mobile number or email'),
  phoneCode: optional(totpRecoveryFieldsSchema.shape.phoneCode),
  emailCode: optional(totpRecoveryFieldsSchema.shape.emailCode),
  password: optional(totpRecoveryFieldsSchema.shape.password),
});
export type RecoveryFormInput = {
  identifier: string;
  phoneCode: string;
  emailCode: string;
  password: string;
};
// A Google-only account has no mobile, so the same field takes its verified email.
const whoIs = (identifier: string) =>
  identifier.includes('@') ? { email: identifier } : { phone: identifier };
export function useRecoveryRequest() {
  const [proof, setProof] = useState<TotpRecoveryResponse>();
  const [sent, setSent] = useState<string>();
  const form = useForm({
    resolver: zodResolver(recoverySchema),
    defaultValues: { identifier: '', phoneCode: '', emailCode: '', password: '' },
  });
  const code = useRequestRecoveryCode();
  const start = useStartRecovery();
  const errors = form.formState.errors;
  async function send(method: 'phone' | 'email') {
    if (!(await form.trigger('identifier'))) return;
    try {
      await code.mutateAsync({ ...whoIs(form.getValues('identifier').trim()), method });
      form.clearErrors('root');
      setSent(
        method === 'phone' ? 'A mobile code was sent.' : 'A code was sent to your verified email.',
      );
    } catch (error) {
      formError(error, form.setError);
    }
  }
  const submit = form.handleSubmit(async (input) => {
    try {
      const { identifier, ...proofs } = input;
      const result = await start.mutateAsync({ ...whoIs(identifier), ...proofs });
      form.reset();
      setProof(result);
    } catch (error) {
      formError(error, form.setError);
    }
  });
  return { form, proof, sent, errors, send, submit, pending: code.isPending || start.isPending };
}
