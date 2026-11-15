import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { SupportGrantPage, SupportRequestInput } from '@dakly/contracts/support';

import { adminApi } from '@/lib/api-client';

export function useSupportRequests(before: string) {
  return useQuery({
    queryKey: ['support-requests', before],
    queryFn: () => adminApi<SupportGrantPage>(`support${before ? '?before=' + before : ''}`),
  });
}
export function useSupportTargets(query: string) {
  return useQuery({
    queryKey: ['support-targets', query],
    enabled: query.length >= 3,
    queryFn: () =>
      adminApi<Array<{ id: string; name: string }>>(
        `support/targets?query=${encodeURIComponent(query)}`,
      ),
  });
}
export function useRequestSupport() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SupportRequestInput) =>
      adminApi<{ id: string; codeSent: boolean }>('support', input),
    onSuccess: () => client.invalidateQueries({ queryKey: ['support-requests'] }),
  });
}
export function useOpenSupport() {
  return useMutation({
    mutationFn: (id: string) =>
      adminApi<{ token: string; destination: string }>(`support/${id}/handoff`, {}),
    onSuccess: (handoff) => {
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = handoff.destination;
      const token = document.createElement('input');
      token.type = 'hidden';
      token.name = 'token';
      token.value = handoff.token;
      form.append(token);
      document.body.append(form);
      form.submit();
      token.value = '';
      form.remove();
    },
  });
}
