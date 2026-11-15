import { useState } from 'react';
import type { AccountProfile } from '@dakly/contracts/sessions';
import { Button } from '@dakly/ui/button';
import { SessionDialog } from '@/components/session-dialog';
import { ProfileDetails } from './profile-details';
import { useSecurityRefresh } from '../hooks/use-security-refresh';
import { EmailForm } from './email-form';
import { PasswordForm } from './password-form';
export function ProfilePanel({ profile }: { profile: AccountProfile }) {
  const [editing, setEditing] = useState<'email' | 'password'>();
  const [saved, setSaved] = useState('');
  const refresh = useSecurityRefresh();
  let emailLabel = 'Add email';
  if (profile.email) emailLabel = profile.isEmailVerified ? 'Change email' : 'Verify email';
  function done() {
    setSaved(editing === 'email' ? 'Email verified.' : 'Password saved.');
    setEditing(undefined);
    void refresh();
  }
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">My profile</h2>
      <ProfileDetails profile={profile} />
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => setEditing('email')}>{emailLabel}</Button>
        <Button variant="secondary" onClick={() => setEditing('password')}>
          {profile.hasPassword ? 'Change password' : 'Set password'}
        </Button>
      </div>
      {saved ? <p role="status">{saved}</p> : null}
      {editing ? (
        <SessionDialog
          open
          title={editing === 'email' ? 'Verify account email' : 'Change account password'}
          onClose={() => setEditing(undefined)}
        >
          {editing === 'email' ? (
            <EmailForm profile={profile} onDone={done} />
          ) : (
            <PasswordForm profile={profile} onDone={done} />
          )}
        </SessionDialog>
      ) : null}
    </section>
  );
}
