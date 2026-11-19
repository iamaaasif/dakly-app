import { createHmac, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

const deliverySchema = z.looseObject({
  object: z.string().min(1),
  entry: z.array(z.looseObject({ id: z.string().min(1) })),
});

export function verifyMetaWebhookSignature(
  rawBody: Buffer,
  signature: string,
  appSecret: string,
): boolean {
  if (!/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'));
}

export function readMetaWebhookDelivery(payload: unknown): Record<string, unknown> | undefined {
  return deliverySchema.safeParse(payload).data;
}
