'use client';
import { useRouter } from 'next/navigation';

import type { StaffChallenge, StaffEnrollment } from '@dakly/contracts/staff-auth';
import { Button } from '@dakly/ui/button';

import { useStaffPasskey } from '../api/passkey';
import { TotpForm } from './totp-form';

type FactorChallengeProps = { enrollment: StaffEnrollment } | { signIn: StaffChallenge };
export function FactorChallenge(props: FactorChallengeProps) {
  const router = useRouter();
  const passkey = useStaffPasskey();
  const data = 'enrollment' in props ? props.enrollment : props.signIn;
  const setup = 'enrollment' in props ? props.enrollment.totp : undefined;
  const hasTotp = 'enrollment' in props ? Boolean(setup) : props.signIn.factors.includes('totp');
  return (
    <div className="space-y-5">
      <p className="text-muted">Complete verification within five minutes.</p>
      {setup ? (
        <div className="space-y-2">
          <p>
            Add a new account in your authenticator. Choose a time-based code and enter this setup
            key.
          </p>
          <code className="block rounded-md bg-surface-muted p-3 break-all">{setup.secret}</code>
          <p className="text-muted text-sm">
            Keep this key private. It is only shown during setup.
          </p>
        </div>
      ) : null}
      {hasTotp ? <TotpForm challenge={data.challenge} /> : null}
      {data.passkey ? (
        <Button
          className="w-full"
          loading={passkey.isPending}
          onClick={() => passkey.mutate(props, { onSuccess: () => router.replace('/') })}
        >
          {'enrollment' in props ? 'Create passkey and sign in' : 'Verify with passkey'}
        </Button>
      ) : null}
      {passkey.error ? (
        <p role="alert" className="text-danger">
          Passkey verification did not finish. Try again or restart sign-in.
        </p>
      ) : null}
      <a className="inline-flex min-h-10 items-center text-action underline" href="/sign-in">
        Restart sign-in
      </a>
    </div>
  );
}
