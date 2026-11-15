import { useMutation } from '@tanstack/react-query';

import type { StaffEnrollmentInput, StaffEnrollment } from '@dakly/contracts/staff-auth';

import { adminRequest } from '@/lib/api-client';

export const useStaffEnrollment = () =>
  useMutation({
    mutationFn: (input: StaffEnrollmentInput) => adminRequest<StaffEnrollment>('enroll', input),
  });
