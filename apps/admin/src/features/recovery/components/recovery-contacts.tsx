'use client';
import { type UseFormReturn } from 'react-hook-form';

import {
  type StaffRecoveryPreview,
  type StaffRecoveryConfirmation,
} from '@dakly/contracts/staff-recovery';
import { Button } from '@dakly/ui/button';
import { Input } from '@dakly/ui/input';

import { type useRecoveryCode } from '../api/recovery';

export function RecoveryContacts({
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
  // Removing 2-step with no replacement contact is proved on one current verified contact.
  const current = effect.removeTotp && !effect.newPhone && !effect.newEmail;
  return (
    <>
      {current ? (
        <p>Send a code to the account&apos;s current verified phone or email and enter it.</p>
      ) : null}
      {(['phone', 'email'] as const).map((channel) => {
        const target = channel === 'phone' ? effect.newPhone : effect.newEmail;
        const field = channel === 'phone' ? 'phoneCode' : 'emailCode';
        return target || current ? (
          <div className="space-y-2" key={channel}>
            <p className="break-all">
              {target ? `New ${channel}: ${target}` : `Current verified ${channel}`}
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
