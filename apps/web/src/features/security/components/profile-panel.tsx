import { Upload } from 'lucide-react';
import { useState } from 'react';

import type { AccountProfile } from '@dakly/contracts/sessions';
import { Button } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';

import { useSecurityRefresh } from '../hooks/use-security-refresh';
import { EmailForm } from './email-form';
import { PasswordForm } from './password-form';
import { ProfileDetails } from './profile-details';
import { SessionDialog } from '@/components/session-dialog';
import { initialsOf } from '@/lib/initials';

function ProfileAvatarHeader({ name }: { name?: string | null }) {
  return (
    <div className="flex items-center gap-4 border-b border-border pb-4">
      <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-surface-muted text-base font-bold text-text">
        {initialsOf(name || 'U')}
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Button variant="secondary" type="button" disabled className="h-8 min-h-8 text-xs">
            <Upload className="size-3.5" aria-hidden="true" />
            Upload photo
          </Button>
          <button
            type="button"
            disabled
            className="text-xs font-medium text-danger hover:underline disabled:opacity-50"
          >
            Remove
          </button>
        </div>
        <p className="text-xs text-text-muted">JPG or PNG, square works best.</p>
      </div>
    </div>
  );
}

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
    <section className="space-y-6">
      <Card className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-text">My profile</h2>
          <p className="text-xs text-text-muted">
            How you appear in Dakly. Your mobile number is also how you log in.
          </p>
        </div>

        <ProfileAvatarHeader name={profile.name} />

        <ProfileDetails profile={profile} />

        <div className="flex flex-wrap gap-3 border-t border-border pt-4">
          <Button onClick={() => setEditing('email')}>{emailLabel}</Button>
          <Button variant="secondary" onClick={() => setEditing('password')}>
            {profile.hasPassword ? 'Change password' : 'Set password'}
          </Button>
        </div>
      </Card>

      {saved ? (
        <p role="status" className="text-sm text-success">
          {saved}
        </p>
      ) : null}
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
