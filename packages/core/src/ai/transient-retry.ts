const retryWaitsMs = [800, 2000];
const transientFailures = new Set(['LLM_REQUEST_FAILED', 'LLM_RATE_LIMITED', 'LLM_UNAVAILABLE']);

// A request the vendor failed or refused for now is tried again after a short wait, while time is
// left; a timeout is not, since the deadline has then passed.
export async function retryTransientFailure<R extends { kind: string; code?: string }>(
  first: R,
  retry: {
    deadline: number;
    now: () => number;
    isStopped: () => Promise<boolean>;
    attempt: (timeoutMs: number) => Promise<R>;
  },
): Promise<R> {
  let result = first;
  for (const wait of retryWaitsMs) {
    if (result.kind !== 'failure' || !transientFailures.has(result.code ?? '')) return result;
    const left = retry.deadline - retry.now() - wait;
    if (left <= 0 || (await retry.isStopped())) return result;
    await new Promise((resolve) => setTimeout(resolve, wait));
    result = await retry.attempt(left);
  }
  return result;
}
