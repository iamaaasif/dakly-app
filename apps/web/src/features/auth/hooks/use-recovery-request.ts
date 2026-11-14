'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { totpRecoverySchema, type TotpRecoveryResponse } from '@dakly/contracts/totp';
import { useRequestRecoveryCode } from '../api/request-recovery-code';
import { useStartRecovery } from '../api/start-recovery';
import { formError } from '../form-error';
const recoverySchema = totpRecoverySchema.extend({
  emailCode: z.union([
    totpRecoverySchema.shape.emailCode,
    z.literal('').transform(() => undefined),
  ]),
  password: z.union([totpRecoverySchema.shape.password, z.literal('').transform(() => undefined)]),
});
export function useRecoveryRequest() {
  const [proof, setProof] = useState<TotpRecoveryResponse>();
  const [sent, setSent] = useState<string>();
  const form = useForm({
    resolver: zodResolver(recoverySchema),
    defaultValues: { phone: '', phoneCode: '', emailCode: '', password: '' },
  });
  const code = useRequestRecoveryCode();
  const start = useStartRecovery();
  const errors = form.formState.errors;
  async function send(method: 'phone' | 'email') {
    if (!(await form.trigger('phone'))) return;
    try {
      await code.mutateAsync({ phone: form.getValues('phone'), method });
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
      const result = await start.mutateAsync(input);
      form.reset();
      setProof(result);
    } catch (error) {
      formError(error, form.setError);
    }
  });
  return { form, proof, sent, errors, send, submit, pending: code.isPending || start.isPending };
}
