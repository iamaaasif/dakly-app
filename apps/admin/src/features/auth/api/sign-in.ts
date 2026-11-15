import { useMutation } from '@tanstack/react-query';
import type { StaffSignInInput, StaffChallenge } from '@dakly/contracts/staff-auth';
import { adminRequest } from '@/lib/api-client';
export const useStaffSignIn = () =>
  useMutation({
    mutationFn: (input: StaffSignInInput) => adminRequest<StaffChallenge>('sign-in', input),
  });
