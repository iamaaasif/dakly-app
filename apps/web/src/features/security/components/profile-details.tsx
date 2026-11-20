import type { AccountProfile } from '@dakly/contracts/sessions';
import { Badge } from '@dakly/ui/badge';

import { formatPhone } from '@/lib/format-phone';

function EmailBadge({ profile }: { profile: AccountProfile }) {
  if (profile.isEmailVerified) return <Badge variant="success">Verified</Badge>;
  return profile.email ? <Badge variant="neutral">Not verified</Badge> : null;
}

export function ProfileDetails({ profile }: { profile: AccountProfile }) {
  return (
    <dl className="grid min-w-0 gap-4 sm:grid-cols-2">
      <div className="rounded-lg border border-border p-3">
        <dt className="text-xs font-medium tracking-wider text-text-muted uppercase">Name</dt>
        <dd className="mt-1 font-medium text-text">{profile.name}</dd>
      </div>
      <div className="rounded-lg border border-border p-3">
        <dt className="flex items-center justify-between text-xs font-medium tracking-wider text-text-muted uppercase">
          <span>Email</span>
          <EmailBadge profile={profile} />
        </dt>
        <dd className="mt-1 font-medium text-text">{profile.email ?? 'No email added'}</dd>
      </div>
      <div className="rounded-lg border border-border p-3">
        <dt className="flex items-center justify-between text-xs font-medium tracking-wider text-text-muted uppercase">
          <span>Mobile number</span>
          {profile.isPhoneVerified ? <Badge variant="success">Verified</Badge> : null}
        </dt>
        <dd className="mt-1 font-medium text-text">
          {profile.phone ? formatPhone(profile.phone) : 'No mobile number'}
        </dd>
      </div>
      <div className="rounded-lg border border-border p-3">
        <dt className="text-xs font-medium tracking-wider text-text-muted uppercase">Password</dt>
        <dd className="mt-1 font-medium text-text">
          {profile.hasPassword ? 'Password set' : 'No password set'}
        </dd>
      </div>
    </dl>
  );
}
