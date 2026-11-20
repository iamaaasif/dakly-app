// The Facebook window comes back to /integrations/meta, which hands the result to this tab.
export const metaLoginMessageType = 'dakly-meta-login';

export type MetaLoginMessage =
  | { type: typeof metaLoginMessageType; state: string; code: string }
  | { type: typeof metaLoginMessageType; error: string };

export function readMetaLoginMessage(data: unknown): MetaLoginMessage | null {
  if (typeof data !== 'object' || data === null) return null;
  const message = data as Record<string, unknown>;
  if (message.type !== metaLoginMessageType) return null;
  if (typeof message.error === 'string')
    return { type: metaLoginMessageType, error: message.error };
  if (typeof message.state === 'string' && typeof message.code === 'string')
    return { type: metaLoginMessageType, state: message.state, code: message.code };
  return null;
}
