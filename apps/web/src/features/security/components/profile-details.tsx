import type { AccountProfile } from '@dakly/contracts/sessions';

import { formatPhone } from '@/lib/format-phone';

export function ProfileDetails({ profile }: { profile: AccountProfile }) {
  return (
    <dl className="space-y-3 break-words">
      <div>
        <dt className="font-medium">Name</dt>
        <dd>{profile.name}</dd>
      </div>
      <div>
        <dt className="font-medium">Mobile number</dt>
        <dd>
          {profile.phone ? formatPhone(profile.phone) : 'No mobile number'}{' '}
          {profile.isPhoneVerified ? '· Verified' : ''}
        </dd>
      </div>
      <div>
        <dt className="font-medium">Email</dt>
        <dd>
          {profile.email ?? 'No email added'} ·{' '}
          {profile.isEmailVerified ? 'Verified' : 'Not verified'}
        </dd>
      </div>
      <div>
        <dt className="font-medium">Password</dt>
        <dd>{profile.hasPassword ? 'Password set' : 'No password set'}</dd>
      </div>
    </dl>
  );
}
