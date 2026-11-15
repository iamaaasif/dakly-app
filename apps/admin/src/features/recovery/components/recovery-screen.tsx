'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { StaffRecoveryTarget } from '@dakly/contracts/staff-recovery';
import { RecoveryLookup } from './recovery-lookup';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  staffRecoveryRequestSchema,
  type StaffRecoveryRequest,
} from '@dakly/contracts/staff-recovery';
import { Button } from '@dakly/ui/button';
import { Input } from '@dakly/ui/input';
import { Card } from '@dakly/ui/card';
import { useRecoveryPreview } from '../api/recovery';
import { RecoveryConfirmation } from './recovery-confirmation';
export function RecoveryScreen() {
  const [target, setTarget] = useState<StaffRecoveryTarget>();
  return (
    <main className="mx-auto max-w-2xl space-y-5 p-4 md:p-8">
      <Link href="/" className="text-action underline">
        Staff home
      </Link>
      <h1 className="text-2xl font-semibold">Recover a shop account</h1>
      <RecoveryLookup onSelect={setTarget} />
      {target ? (
        <RecoveryForm key={target.id} target={target} />
      ) : (
        <p>Find the account using its old verified contact.</p>
      )}
    </main>
  );
}
function RecoveryForm({ target }: { target: StaffRecoveryTarget }) {
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
        <form className="space-y-4" onSubmit={form.handleSubmit((input) => preview.mutate(input))}>
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

function RecoveryFields({ form }: { form: UseFormReturn<StaffRecoveryRequest> }) {
  return (
    <>
      <label className="block" htmlFor="recovery-reason-type">
        Reason type
      </label>
      <select
        id="recovery-reason-type"
        className="min-h-10 w-full rounded-md border border-input-border bg-surface p-2"
        {...form.register('reasonType')}
      >
        <option value="lost_phone">Lost phone</option>
        <option value="lost_authenticator">Lost authenticator</option>
        <option value="lost_email">Lost email</option>
      </select>
      <label className="block" htmlFor="recovery-reason">
        Reason (10–1000 characters)
      </label>
      <Input id="recovery-reason" {...form.register('reason')} />
      <IdentityChecks form={form} />

      <label className="flex min-h-10 items-center gap-2">
        <input type="checkbox" {...form.register('removeTotp')} />
        Remove two-step verification and backup codes
      </label>
      <label className="block" htmlFor="recovery-phone">
        Replacement phone (optional)
      </label>
      <Input
        id="recovery-phone"
        inputMode="tel"
        {...form.register('newPhone', { setValueAs: (value: string) => value || undefined })}
      />
      <label className="block" htmlFor="recovery-email">
        Replacement email (optional)
      </label>
      <Input
        id="recovery-email"
        type="email"
        {...form.register('newEmail', { setValueAs: (value: string) => value || undefined })}
      />
    </>
  );
}
function IdentityChecks({ form }: { form: UseFormReturn<StaffRecoveryRequest> }) {
  return (
    <fieldset className="space-y-3">
      <legend>Identity checks</legend>
      <label className="flex min-h-10 items-center gap-2">
        <input type="checkbox" {...form.register('checks.nidLastFourMatched')} />
        NID last four digits matched
      </label>
      <label className="flex min-h-10 items-center gap-2">
        <input type="checkbox" {...form.register('checks.storeDetailsMatched')} />
        Shop details matched (required when the account has shops)
      </label>
      <label className="flex min-h-10 items-center gap-2">
        <input type="checkbox" {...form.register('checks.oldNumberCallbackAttempted')} />
        Call-back to the old number attempted
      </label>
    </fieldset>
  );
}
