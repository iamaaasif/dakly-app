import type { UseFormRegisterReturn, FieldError } from 'react-hook-form';
import type { MemberResponse } from '@dakly/contracts/team';
export function TransferRecipientField({
  members,
  field,
  error,
}: {
  members: MemberResponse[];
  field: UseFormRegisterReturn;
  error?: FieldError;
}) {
  return (
    <label className="block">
      New Owner
      <select
        aria-invalid={Boolean(error)}
        aria-describedby={error ? 'recipient-error' : undefined}
        className="mt-2 min-h-10 w-full rounded-md border border-input-border bg-surface px-3"
        {...field}
      >
        <option value="">Choose a member</option>
        {members.map((member) => (
          <option key={member.id} value={member.id}>
            {member.name ?? member.email ?? member.phone}
          </option>
        ))}
      </select>
    </label>
  );
}
