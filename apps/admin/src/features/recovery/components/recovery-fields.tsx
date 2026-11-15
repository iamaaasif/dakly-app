import { type UseFormReturn } from 'react-hook-form';

import { type StaffRecoveryRequest } from '@dakly/contracts/staff-recovery';
import { Input } from '@dakly/ui/input';

import { IdentityChecks } from './identity-checks';

export function RecoveryFields({ form }: { form: UseFormReturn<StaffRecoveryRequest> }) {
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
