import type { UseFormReturn } from 'react-hook-form';
import type { z } from 'zod';

import type { inviteMemberSchema, InviteMemberInput } from '@dakly/contracts/team';

import { TeamField } from './team-field';

type InviteRecipientProps = {
  channel: 'phone' | 'email';
  onChange: (next: 'phone' | 'email') => void;
  form: UseFormReturn<z.input<typeof inviteMemberSchema>, unknown, InviteMemberInput>;
};
export function InviteRecipient({ channel, onChange, form }: InviteRecipientProps) {
  return (
    <>
      <label className="block">
        Invite by
        <select
          aria-label="Invite by"
          className="mt-2 min-h-10 w-full rounded-md border border-input-border bg-surface px-3"
          value={channel}
          onChange={(event) => onChange(event.target.value as 'phone' | 'email')}
        >
          <option value="phone">Mobile number</option>
          <option value="email">Email</option>
        </select>
      </label>
      {channel === 'phone' ? (
        <TeamField
          label="Mobile number"
          field={form.register('phone')}
          error={form.formState.errors.phone}
          type="tel"
        />
      ) : (
        <TeamField
          label="Email"
          field={form.register('email')}
          error={form.formState.errors.email}
          type="email"
        />
      )}
    </>
  );
}
