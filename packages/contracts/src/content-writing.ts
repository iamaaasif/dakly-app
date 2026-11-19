import { z } from 'zod';

import { searchText } from './search-text';
import { contentKinds, contentLanguages } from './social';

export const contentTones = ['friendly', 'festive', 'urgent', 'premium', 'playful'] as const;

export const productDescriptionRequestSchema = z.strictObject({
  tone: z.enum(contentTones),
  language: z.enum(contentLanguages),
});

const writeRequestSchema = productDescriptionRequestSchema.extend({
  kind: z.enum(contentKinds),
  productId: z.uuid().optional(),
});

export const contentWriteRequestSchema = z
  .discriminatedUnion('operation', [
    writeRequestSchema.extend({
      operation: z.literal('generate'),
      topic: searchText.max(2000).optional(),
    }),
    writeRequestSchema.extend({
      operation: z.enum(['shorten', 'friendlier', 'translate']),
      body: searchText.max(20_000),
    }),
  ])
  .superRefine((input, context) => {
    if (input.kind === 'product_description' && !input.productId)
      context.addIssue({ code: 'custom', path: ['productId'], message: 'Choose a saved product' });
    if (input.operation === 'generate' && Boolean(input.topic) === Boolean(input.productId))
      context.addIssue({
        code: 'custom',
        path: ['topic'],
        message: 'Enter a topic or choose a saved product',
      });
  });

export const contentWriteOutputSchema = z.strictObject({ options: z.array(z.string()) });

export type ContentWriteInput = z.infer<typeof contentWriteRequestSchema>;
export type ProductDescriptionInput = z.infer<typeof productDescriptionRequestSchema>;
export type ContentWriteResult = z.infer<typeof contentWriteOutputSchema> & { aiRunId: string };
