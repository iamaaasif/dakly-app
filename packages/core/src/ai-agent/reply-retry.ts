const OUTAGE_RETRY_MS = 10_000;
const OUTAGE_RETRY_WINDOW_MS = 3 * 60_000;

export const retryAt = (now: Date, delayMs = 1000) => ({ delayUntil: now.getTime() + delayMs });

// A model outage of a minute or two should not send every waiting customer to a person, so a
// chat whose latest message is still fresh is tried again; an older one is handed over.
export function outageRetryDelay(reason: string | null | undefined, latestAt: Date, now: Date) {
  const isFresh = now.getTime() - latestAt.getTime() < OUTAGE_RETRY_WINDOW_MS;
  return reason === 'ai_unavailable' && isFresh ? OUTAGE_RETRY_MS : undefined;
}
