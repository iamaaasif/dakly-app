import { useMutation, useQueryClient } from '@tanstack/react-query';

import { adminRequest } from '@/lib/api-client';

export function useStaffSignOut() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => adminRequest<void>('sign-out', {}),
    onSuccess: () => client.clear(),
  });
}
