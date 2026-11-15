'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';

import {
  staffRecoveryConfirmationSchema,
  type StaffRecoveryPreview,
  type StaffRecoveryConfirmation,
} from '@dakly/contracts/staff-recovery';

import { useRecoveryCode, useRecoverAccount } from '../api/recovery';
import { RecoveryActions } from './recovery-actions';
import { RecoveryContacts } from './recovery-contacts';
import { RecoveryEffect } from './recovery-effect';

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
          <p role="alert">Enter each verification code as six digits.</p>
        ) : null}
        <RecoveryActions recover={recover} onClose={() => dialog.current?.close()} />
      </form>
    </dialog>
  );
}
