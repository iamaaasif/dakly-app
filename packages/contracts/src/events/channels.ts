import { z } from 'zod';

const connectionEvent = {
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.strictObject({ channelConnectionId: z.uuid() }),
};

export const channelConnectedEventSchema = z.strictObject({
  type: z.literal('channel.connected'),
  ...connectionEvent,
});

export const channelDisconnectedEventSchema = z.strictObject({
  type: z.literal('channel.disconnected'),
  ...connectionEvent,
});

export const channelNeedsReconnectEventSchema = z.strictObject({
  type: z.literal('channel.needs_reconnect'),
  ...connectionEvent,
});
