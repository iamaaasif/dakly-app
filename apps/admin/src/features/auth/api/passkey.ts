import { useMutation } from '@tanstack/react-query';

import type { StaffChallenge, StaffEnrollment } from '@dakly/contracts/staff-auth';

import { adminRequest } from '@/lib/api-client';

export function useStaffPasskey() {
  return useMutation({
    mutationFn: async (input: { enrollment: StaffEnrollment } | { signIn: StaffChallenge }) => {
      const { startRegistration, startAuthentication } = await import('@simplewebauthn/browser');
      if ('enrollment' in input) {
        const credential = await startRegistration({ optionsJSON: input.enrollment.passkey! });
        await adminRequest<void>('passkey/register', {
          challenge: input.enrollment.challenge,
          credential,
        });
      } else {
        const credential = await startAuthentication({ optionsJSON: input.signIn.passkey! });
        await adminRequest<void>('passkey/authenticate', {
          challenge: input.signIn.challenge,
          credential,
        });
      }
    },
  });
}
