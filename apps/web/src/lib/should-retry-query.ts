import { ApiError } from '@dakly/ui/api-client';

// A 4xx answer is the server's final word (no zones set up, not allowed, not found), so retrying
// only delays the message by the backoff, about seven seconds. Network and 5xx errors can pass.
export function shouldRetryQuery(failureCount: number, error: Error): boolean {
  if (error instanceof ApiError && error.status !== undefined && error.status < 500) return false;
  return failureCount < 2;
}
