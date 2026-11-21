import { z } from 'zod';

import { searchText } from './search-text';
import { contentKinds, contentLanguages } from './social';

export const contentTones = ['friendly', 'festive', 'urgent', 'premium', 'playful'] as const;

export const contentLengths = ['short', 'medium', 'long'] as const;

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
      length: z.enum(contentLengths).optional(),
      hashtags: z.boolean().optional(),
      orderLine: z.boolean().optional(),
    }),
    writeRequestSchema.extend({
      operation: z.enum(['shorten', 'friendlier', 'translate']),
      body: searchText.max(20_000),
    }),
  ])
  .superRefine((input, context) => {
    if (input.kind === 'product_description' && !input.productId)
      context.addIssue({ code: 'custom', path: ['productId'], message: 'Choose a saved product' });
    if (input.operation === 'generate' && !input.topic && !input.productId)
      context.addIssue({
        code: 'custom',
        path: ['topic'],
        message: 'Enter a topic or choose a saved product',
      });
    if (input.kind === 'product_description' && input.operation === 'generate' && input.topic)
      context.addIssue({
        code: 'custom',
        path: ['topic'],
        message: 'Write a description from the saved product details',
      });
  });

export const contentWriteOutputSchema = z.strictObject({ options: z.array(z.string()) });

export type ContentWriteInput = z.infer<typeof contentWriteRequestSchema>;
export type ProductDescriptionInput = z.infer<typeof productDescriptionRequestSchema>;
export type ContentWriteResult = z.infer<typeof contentWriteOutputSchema> & {
  aiRunId: string;
};

export const contentCreditsSchema = z.strictObject({
  remaining: z.number().int().nonnegative(),
  allowance: z.number().int().nonnegative(),
  resetsAt: z.iso.datetime(),
});

export type ContentCredits = z.infer<typeof contentCreditsSchema>;
