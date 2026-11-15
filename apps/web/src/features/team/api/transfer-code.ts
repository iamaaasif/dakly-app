import { useMutation } from '@tanstack/react-query';
import type { OwnershipTransferCodeInput } from '@dakly/contracts/team';
import { useStoreRequest } from '@/lib/store-request';
export function useTransferCode() {
  const { request } = useStoreRequest();
  return useMutation({
    gcTime: 0,
    mutationFn: (input: OwnershipTransferCodeInput) =>
      request<void>('/store/ownership-transfer/code', { body: input }),
  });
}
