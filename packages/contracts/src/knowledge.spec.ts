import { describe, expect, it } from 'vitest';

import { createKnowledgeItemSchema, listKnowledgeItemsQuerySchema } from './knowledge';

describe('knowledge item input', () => {
  const fileId = '9e75f9f4-ccbb-45d9-8fb7-7f19e39af6db';

  it('accepts Bangla shop text and a separate file input', () => {
    expect(
      createKnowledgeItemSchema.parse({ kind: 'policy', answer: '  ঢাকা ৬০ টাকা।  ' }),
    ).toEqual({
      kind: 'policy',
      answer: 'ঢাকা ৬০ টাকা।',
    });
    expect(createKnowledgeItemSchema.parse({ kind: 'file', fileId })).toEqual({
      kind: 'file',
      fileId,
    });
  });

  it.each([
    { kind: 'file', fileId, objectKey: 'stores/other/file' },
    { kind: 'policy', answer: 'ঢাকা ৬০ টাকা।', storeId: fileId },
    { kind: 'file', fileId: 'not a UUID' },
    { kind: 'policy', answer: '  ' },
  ])('rejects a mixed or invalid item', (input) => {
    expect(createKnowledgeItemSchema.safeParse(input).success).toBe(false);
  });

  it('defaults to 50 items and rejects a requested page above 100', () => {
    expect(listKnowledgeItemsQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(listKnowledgeItemsQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
  });
});
