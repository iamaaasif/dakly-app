import { type UseFormReturn } from 'react-hook-form';
import { type StaffRecoveryRequest } from '@dakly/contracts/staff-recovery';

export function IdentityChecks({ form }: { form: UseFormReturn<StaffRecoveryRequest> }) {
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
