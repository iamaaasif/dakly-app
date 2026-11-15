import { useEffect } from 'react';
import { ApiError } from '@/lib/api-client';
import { useStoreRequest } from '@/lib/store-request';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  SupportGrantPage,
  SupportSessionResponse,
  SupportCustomerResponse,
} from '@dakly/contracts/support';
import type { CreateCustomerInput } from '@dakly/contracts/customers';
async function request<T>(
  url: string,
  options: { body?: unknown; contextTag?: string; signal?: AbortSignal } = {},
): Promise<T> {
  const response = await fetch(url, {
    method: options.body === undefined ? 'GET' : 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(options.contextTag ? { 'X-Support-Context': options.contextTag } : {}),
    },
    signal: options.signal,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (!response.ok) await rejectSupportResponse(response);
  const payload = await response.json();
  if (options.contextTag && payload.contextTag !== options.contextTag) {
    window.dispatchEvent(new Event('dakly-support-changed'));
    throw new ApiError(
      'SUPPORT_CONTEXT_CHANGED',
      'Your support access changed. Refresh before continuing.',
    );
  }
  return payload as T;
}
export function useOwnerSupport(before: string) {
  const store = useStoreRequest();
  return useQuery({
    queryKey: ['owner-support', store.contextTag, before],
    retry: false,
    queryFn: ({ signal }) =>
      store.request<SupportGrantPage>(`/support-access${before ? '?before=' + before : ''}`, {
        signal,
      }),
  });
}
export function useOwnerDecision() {
  const store = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: string;
      action: 'code' | 'approve' | 'deny' | 'end';
      code?: string;
    }) =>
      store.request(`/support-access/${input.id}/${input.action}`, {
        body: input.code ? { code: input.code } : {},
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['owner-support', store.contextTag] }),
  });
}
export function useSupportSession() {
  const client = useQueryClient();
  useEffect(() => {
    const changed = () => {
      void client.invalidateQueries({ queryKey: ['support-session'] });
    };
    window.addEventListener('dakly-support-changed', changed);
    return () => window.removeEventListener('dakly-support-changed', changed);
  }, [client]);
  return useQuery({
    queryKey: ['support-session'],
    queryFn: ({ signal }) => request<SupportSessionResponse>('/support/api/session', { signal }),
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
    retry: false,
  });
}
export function useSupportCustomer(id: string, contextTag: string) {
  const client = useQueryClient();
  useEffect(
    () => () => {
      void client.cancelQueries({ queryKey: ['support-customer', contextTag] });
      client.removeQueries({ queryKey: ['support-customer', contextTag] });
    },
    [client, contextTag],
  );

  return useQuery({
    queryKey: ['support-customer', contextTag, id],
    queryFn: ({ signal }) =>
      request<SupportCustomerResponse>(`/support/api/customers/${id}`, { contextTag, signal }),
    enabled: Boolean(id),
    retry: false,
  });
}
export function useSupportCreate(contextTag: string) {
  return useMutation({
    mutationFn: (input: CreateCustomerInput) =>
      request<SupportCustomerResponse>('/support/api/customers', { body: input, contextTag }),
  });
}

async function rejectSupportResponse(response: Response): Promise<never> {
  const payload = await response.json();
  if (payload.error?.code === 'SUPPORT_CONTEXT_CHANGED')
    window.dispatchEvent(new Event('dakly-support-changed'));
  throw new ApiError(
    payload.error?.code ?? 'REQUEST_FAILED',
    payload.error?.message ?? 'Request failed',
  );
}
