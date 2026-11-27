import { z } from 'zod';

import { chatIntents, handoverReasons } from './chats';

export const chatClassificationSchema = z.strictObject({
  intent: z.enum(chatIntents),
  language: z.enum(['bn', 'banglish', 'en']),
  sentiment: z.enum(['positive', 'neutral', 'negative', 'angry']),
  asksForPerson: z.boolean(),
  confidence: z.enum(['high', 'low']),
  handover: z.enum(handoverReasons).exclude(['ai_unavailable', 'allowance_used']).nullable(),
});

export type ChatClassification = z.infer<typeof chatClassificationSchema>;
