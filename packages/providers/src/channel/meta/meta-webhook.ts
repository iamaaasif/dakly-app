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

export function readMetaWebhookDelivery(rawBody: Buffer): Record<string, unknown> | undefined {
  try {
    const payload: unknown = JSON.parse(rawBody.toString('utf8'), (key, value: unknown) => {
      if (key === '__proto__' || key === 'constructor') throw new SyntaxError('Unsafe JSON key');
      return value;
    });
    return deliverySchema.safeParse(payload).data;
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof RangeError) return undefined;
    throw error;
  }
}
