import { z } from 'zod';

export const metaWebhookVerificationSchema = z.object({
  'hub.mode': z.literal('subscribe'),
  'hub.challenge': z.string().regex(/^\d+$/),
  'hub.verify_token': z.string().min(1),
});

export type MetaWebhookVerification = z.infer<typeof metaWebhookVerificationSchema>;
