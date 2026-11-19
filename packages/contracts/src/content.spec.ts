import { describe, expect, it } from 'vitest';

import { createContentPieceSchema, updateContentPieceSchema } from './content';

describe('content library input', () => {
  const piece = { kind: 'sms', language: 'bn', body: 'অর্ডার করুন\n' };

  it('keeps the text as entered', () => {
    expect(createContentPieceSchema.parse(piece)).toEqual(piece);
  });

  it('rejects body text that is blank or contains a null character', () => {
    expect(createContentPieceSchema.safeParse({ ...piece, body: ' \n ' }).success).toBe(false);
    expect(createContentPieceSchema.safeParse({ ...piece, body: 'অর্ডার\u0000 করুন' }).success).toBe(
      false,
    );
  });

  it('rejects attempts to set the creator or provenance', () => {
    expect(createContentPieceSchema.safeParse({ ...piece, createdByUserId: null }).success).toBe(
      false,
    );
    expect(
      updateContentPieceSchema.safeParse({ body: piece.body, isAiWritten: false }).success,
    ).toBe(false);
  });
});
