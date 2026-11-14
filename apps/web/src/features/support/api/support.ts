import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { SupportGrantPage, SupportSessionResponse } from '@dakly/contracts/support';
import type { CreateCustomerInput, CustomerResponse } from '@dakly/contracts/customers';
async function request<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = await response.json();
    throw new Error(payload.error?.message ?? 'Request failed');
  }
  const text = await response.text();
  return text ? JSON.parse(text) : (undefined as T);
}
export function useOwnerSupport(before: string) {
  return useQuery({
    queryKey: ['owner-support', before],
    queryFn: () =>
      request<SupportGrantPage>(`/api/support-access${before ? '?before=' + before : ''}`),
  });
}
export function useOwnerDecision() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: string;
      action: 'code' | 'approve' | 'deny' | 'end';
      code?: string;
    }) =>
      request(
        `/api/support-access/${input.id}/${input.action}`,
        input.code ? { code: input.code } : {},
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: ['owner-support'] }),
  });
}
export function useSupportSession() {
  return useQuery({
    queryKey: ['support-session'],
    queryFn: () => request<SupportSessionResponse>('/support/api/session'),
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
    retry: false,
  });
}
export function useSupportCustomer(id: string) {
  return useQuery({
    queryKey: ['support-customer', id],
    queryFn: () => request<CustomerResponse>(`/support/api/customers/${id}`),
    enabled: Boolean(id),
    retry: false,
  });
}
export function useSupportCreate() {
  return useMutation({
    mutationFn: (input: CreateCustomerInput) =>
      request<CustomerResponse>('/support/api/customers', input),
  });
}
