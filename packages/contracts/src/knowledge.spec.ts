import { describe, expect, it } from 'vitest';

import {
  changeKnowledgeItemSchema,
  createKnowledgeItemSchema,
  knowledgeFileBytes,
  knowledgeUploadSchema,
  listKnowledgeItemsQuerySchema,
} from './knowledge';

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

  it('rejects a null character in new or changed text', () => {
    const answer = 'ঢাকা\u0000 ৬০ টাকা।';
    expect(createKnowledgeItemSchema.safeParse({ kind: 'policy', answer }).success).toBe(false);
    expect(changeKnowledgeItemSchema.safeParse({ answer }).success).toBe(false);
  });

  it('takes a question and keywords and trims them', () => {
    expect(
      createKnowledgeItemSchema.parse({
        kind: 'policy',
        question: ' Showroom kothay? ',
        answer: 'Dhanmondi.',
        keywords: [' showroom ', 'dokan'],
      }),
    ).toEqual({
      kind: 'policy',
      question: 'Showroom kothay?',
      answer: 'Dhanmondi.',
      keywords: ['showroom', 'dokan'],
    });
    expect(
      changeKnowledgeItemSchema.parse({
        question: 'Showroom?',
        answer: 'Dhanmondi.',
        keywords: [],
      }),
    ).toEqual({ question: 'Showroom?', answer: 'Dhanmondi.', keywords: [] });
  });

  it.each([
    { question: ' ' },
    { keywords: ['ok', ''] },
    { keywords: Array.from({ length: 11 }, (_, index) => `word${index}`) },
    { keywords: ['x'.repeat(41)] },
  ])('rejects an empty question or a bad keyword list', (extra) => {
    expect(
      createKnowledgeItemSchema.safeParse({ kind: 'policy', answer: 'Dhanmondi.', ...extra })
        .success,
    ).toBe(false);
  });

  it('accepts only PDF or plain text uploads within the file size limit', () => {
    expect(
      knowledgeUploadSchema.safeParse({
        fileName: 'Size chart.pdf',
        contentType: 'application/pdf',
        sizeBytes: knowledgeFileBytes,
      }).success,
    ).toBe(true);
    expect(
      knowledgeUploadSchema.safeParse({
        contentType: 'text/plain',
        sizeBytes: knowledgeFileBytes + 1,
      }).success,
    ).toBe(false);
    expect(
      knowledgeUploadSchema.safeParse({
        contentType: 'image/png',
        sizeBytes: 100,
      }).success,
    ).toBe(false);
  });

  it('needs the name of the uploaded file', () => {
    const upload = { contentType: 'text/plain', sizeBytes: 10 };
    expect(knowledgeUploadSchema.safeParse(upload).success).toBe(false);
    expect(knowledgeUploadSchema.safeParse({ ...upload, fileName: '  ' }).success).toBe(false);
    expect(knowledgeUploadSchema.parse({ ...upload, fileName: ' Policy.txt ' }).fileName).toBe(
      'Policy.txt',
    );
  });

  it('defaults to 50 items and rejects a requested page above 100', () => {
    expect(listKnowledgeItemsQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(listKnowledgeItemsQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
  });
});
