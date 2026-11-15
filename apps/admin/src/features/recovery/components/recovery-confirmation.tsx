'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useRef } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';

import {
  staffRecoveryConfirmationSchema,
  type StaffRecoveryPreview,
  type StaffRecoveryConfirmation,
} from '@dakly/contracts/staff-recovery';
import { Button } from '@dakly/ui/button';
import { Input } from '@dakly/ui/input';

import { useRecoveryCode, useRecoverAccount } from '../api/recovery';
import { formatDate } from '@/lib/format-date';

export function RecoveryConfirmation({
  preview,
  onClose,
}: {
  preview: StaffRecoveryPreview;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const code = useRecoveryCode();
  const recover = useRecoverAccount();
  const form = useForm<StaffRecoveryConfirmation>({
    resolver: zodResolver(staffRecoveryConfirmationSchema),
    defaultValues: { ...preview, confirmed: true },
  });
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const effect = preview.effect;
  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-labelledby="recover-title"
      className="m-auto max-h-full w-full max-w-lg space-y-4 overflow-y-auto rounded-md border border-border bg-surface p-5 text-text"
    >
      <RecoveryEffect effect={effect} />
      <form
        method="post"
        className="space-y-4"
        onSubmit={form.handleSubmit((input) => recover.mutate(input))}
      >
        <RecoveryContacts
          preview={preview}
          form={form}
          code={code}
          disabled={recover.isSuccess || recover.isPending}
        />
        {code.isSuccess ? (
          <p role="status">Verification code sent. Ask the person for their code.</p>
        ) : null}
        {code.error ? <p role="alert">{code.error.message}</p> : null}
        {recover.error ? (
          <p role="alert">
            {recover.error.message} Used codes cannot be reused. Cancel and review again if needed.
          </p>
        ) : null}
        {Object.keys(form.formState.errors).length ? (
          <p role="alert">Enter a six-digit code for each replacement contact.</p>
        ) : null}
        <RecoveryActions recover={recover} onClose={() => dialog.current?.close()} />
      </form>
    </dialog>
  );
}

function RecoveryEffect({ effect }: { effect: StaffRecoveryPreview['effect'] }) {
  return (
    <>
      <h2 id="recover-title" className="text-lg font-semibold">
        Confirm recovery for {effect.targetName}
      </h2>
      <p className="break-all">Account: {effect.targetId}</p>
      <p>
        {effect.removeTotp ? 'Remove two-step verification and all backup codes. ' : ''}Sign out
        every session immediately.
      </p>
      <p className="break-words">
        Reason: {effect.reasonType.replaceAll('_', ' ')}. {effect.reason}
      </p>
      <p>
        The person and their shop Owners receive security notices. Recovery is recorded in account
        and shop history. Confirm by {formatDate(effect.confirmBy)}.
      </p>
    </>
  );
}
function RecoveryContacts({
  preview,
  form,
  code,
  disabled,
}: {
  preview: StaffRecoveryPreview;
  form: UseFormReturn<StaffRecoveryConfirmation>;
  code: ReturnType<typeof useRecoveryCode>;
  disabled: boolean;
}) {
  const effect = preview.effect;
  return (
    <>
      {(['phone', 'email'] as const).map((channel) => {
        const target = channel === 'phone' ? effect.newPhone : effect.newEmail;
        const field = channel === 'phone' ? 'phoneCode' : 'emailCode';
        return target ? (
          <div className="space-y-2" key={channel}>
            <p className="break-all">
              New {channel}: {target}
            </p>
            <Button
              type="button"
              variant="secondary"
              loading={code.isPending}
              disabled={disabled}
              onClick={() => code.mutate({ ...preview, channel })}
            >
              Send {channel} verification code
            </Button>
            <label className="block" htmlFor={field}>
              {channel === 'phone' ? 'Phone' : 'Email'} verification code
            </label>
            <Input
              id={field}
              inputMode="numeric"
              autoComplete="one-time-code"
              {...form.register(field, { setValueAs: (value: string) => value || undefined })}
            />
          </div>
        ) : null;
      })}
    </>
  );
}

function RecoveryActions({
  recover,
  onClose,
}: {
  recover: ReturnType<typeof useRecoverAccount>;
  onClose: () => void;
}) {
  return (
    <>
      {recover.isSuccess ? (
        <p role="status">
          Account recovered. All old sessions are signed out. Security notices are queued.
        </p>
      ) : (
        <Button type="submit" variant="danger" loading={recover.isPending}>
          Confirm account recovery
        </Button>
      )}
      <Button type="button" variant="secondary" disabled={recover.isPending} onClick={onClose}>
        {recover.isSuccess ? 'Close' : 'Cancel'}
      </Button>
    </>
  );
}
