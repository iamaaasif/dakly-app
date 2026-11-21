import { z } from 'zod';

function utf8ByteLength(text: string): number {
  return Array.from(text).reduce((bytes, character) => {
    if (character.length === 2) return bytes + 4;
    const code = character.charCodeAt(0);
    if (code <= 0x7f) return bytes + 1;
    if (code <= 0x7ff) return bytes + 2;
    return bytes + 3;
  }, 0);
}

export const contactMemoryMaxSerializedBytes = 16_384;
export const contactMemoryContextMaxBytes = 1_200;
export const contactMemoryContextMaxTokens = 300;

export const contactMemoryFactKinds = [
  'size',
  'colour',
  'style',
  'budget',
  'language',
  'tone',
  'past_issue',
  'delivery_area',
] as const;

export const contactMemoryFactSchema = z.strictObject({
  kind: z.enum(contactMemoryFactKinds),
  value: z.string().trim().min(1).max(160),
  source: z.enum(['customer_message', 'own_order', 'staff']),
  sourceId: z.uuid(),
  at: z.iso.datetime(),
});

// Both staff edits and extracted model output use this shape before the guarded write.
export const contactMemorySchema = z
  .strictObject({
    summary: z.string().max(600),
    facts: z.array(contactMemoryFactSchema).max(40),
  })
  .refine(
    (memory) => utf8ByteLength(JSON.stringify(memory)) <= contactMemoryMaxSerializedBytes,
    'Customer memory exceeds the serialized byte budget',
  );

// The prompt builder measures tokenCount with the selected model's tokenizer after rendering.
// It drops whole facts or shortens the summary until both limits pass, before calling the model.
export const renderedContactMemorySchema = z.strictObject({
  text: z
    .string()
    .refine(
      (text) => utf8ByteLength(text) <= contactMemoryContextMaxBytes,
      'Customer memory context exceeds the byte budget',
    ),
  tokenCount: z.number().int().min(0).max(contactMemoryContextMaxTokens),
});

export type ContactMemory = z.infer<typeof contactMemorySchema>;
export type ContactMemoryFact = z.infer<typeof contactMemoryFactSchema>;

// One call returns the chat summary and the customer's memory. A fact names the message or order
// that shows it, and the service drops any fact whose id it did not send. The model cannot write a
// staff fact.
export const contactMemoryExtractionSchema = z.strictObject({
  conversationSummary: z.string().max(600),
  customerSummary: z.string().max(600),
  facts: z
    .array(
      contactMemoryFactSchema
        .pick({ kind: true, value: true, sourceId: true })
        .extend({ source: z.enum(['customer_message', 'own_order']) }),
    )
    .max(20),
});

export type ContactMemoryExtraction = z.infer<typeof contactMemoryExtractionSchema>;
