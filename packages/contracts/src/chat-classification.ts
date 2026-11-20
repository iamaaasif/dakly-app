import { z } from 'zod';

import { handoverReasons } from './chats';

export const chatClassificationSchema = z.strictObject({
  intent: z.enum([
    'greeting',
    'price',
    'size_or_stock',
    'delivery',
    'payment',
    'order',
    'confirm',
    'order_status',
    'exchange',
    'complaint',
    'photo',
    'special_request',
    'other',
  ]),
  language: z.enum(['bn', 'banglish', 'en']),
  sentiment: z.enum(['positive', 'neutral', 'negative', 'angry']),
  asksForPerson: z.boolean(),
  confidence: z.enum(['high', 'low']),
  handover: z.enum(handoverReasons).exclude(['ai_unavailable', 'allowance_used']).nullable(),
});

export type ChatClassification = z.infer<typeof chatClassificationSchema>;
