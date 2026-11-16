import { useMutation, useQueryClient } from '@tanstack/react-query';

import { notificationsKeys } from '../api/notifications-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useNotificationMutation<Input>(
  send: (request: ReturnType<typeof useStoreRequest>['request'], input: Input) => Promise<void>,
) {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: Input) => send(request, input),
    onSuccess: () => client.invalidateQueries({ queryKey: notificationsKeys.all }),
  });
}
