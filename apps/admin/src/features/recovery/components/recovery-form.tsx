'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import type { StaffRecoveryTarget, StaffRecoveryRequest } from '@dakly/contracts/staff-recovery';
import { staffRecoveryRequestSchema } from '@dakly/contracts/staff-recovery';
import { Button } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';

import { useRecoveryPreview } from '../api/recovery';
import { RecoveryConfirmation } from './recovery-confirmation';
import { RecoveryFields } from './recovery-fields';

export function RecoveryForm({ target }: { target: StaffRecoveryTarget }) {
  const preview = useRecoveryPreview();
  const form = useForm<StaffRecoveryRequest>({
    resolver: zodResolver(staffRecoveryRequestSchema),
    defaultValues: {
      targetId: target.id,
      reason: '',
      reasonType: 'lost_phone',
      removeTotp: true,
      checks: { storeDetailsMatched: false },
    },
  });
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">{target.name}</h2>
      <p>
        Recovery takes effect immediately and signs out every session. Complete the identity checks
        with the person first. Record outcomes only; never enter document numbers or NID digits.
      </p>
      <Card>
        <form
          method="post"
          className="space-y-4"
          onSubmit={form.handleSubmit((input) => preview.mutate(input))}
        >
          <RecoveryFields form={form} />
          {Object.keys(form.formState.errors).length ? (
            <p role="alert">
              Check the account ID, reason, identity checks and replacement contacts.
            </p>
          ) : null}
          {preview.error ? <p role="alert">{preview.error.message}</p> : null}
          <Button type="submit" loading={preview.isPending}>
            Review recovery
          </Button>
        </form>
      </Card>
      {preview.data ? (
        <RecoveryConfirmation
          key={preview.data.effect.id}
          preview={preview.data}
          onClose={() => preview.reset()}
        />
      ) : null}
    </section>
  );
}
