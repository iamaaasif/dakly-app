import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

const context = new AsyncLocalStorage<{ jobId: string; storeId?: string }>();
export function runWithJobContext<TResult>(
  work: () => TResult,
  jobId: string = randomUUID(),
): TResult {
  return context.run({ jobId }, work);
}
export function bindVerifiedJobStore(storeId: string): void {
  const bindings = context.getStore();
  if (bindings) bindings.storeId = storeId;
}

export function jobLogBindings(): { jobId?: string; storeId?: string } {
  // Pino may merge into a mixin result; never expose the stored context object.
  return { ...context.getStore() };
}
