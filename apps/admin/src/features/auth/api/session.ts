import { useQuery } from '@tanstack/react-query';

import type { StaffIdentity } from '@dakly/contracts/staff-auth';

import { adminRequest } from '@/lib/api-client';

const staffSessionKey = ['staff-session'] as const;
export const useStaffSession = () =>
  useQuery({
    queryKey: staffSessionKey,
    queryFn: () => adminRequest<StaffIdentity>('session'),
    retry: false,
  });
