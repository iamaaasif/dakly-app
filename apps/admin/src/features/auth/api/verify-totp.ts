import { useMutation } from '@tanstack/react-query';

import type { StaffTotpInput } from '@dakly/contracts/staff-auth';

import { adminRequest } from '@/lib/api-client';

export const useVerifyTotp = () =>
  useMutation({ mutationFn: (input: StaffTotpInput) => adminRequest<void>('totp', input) });
