import { describe, expect, it } from 'vitest';

import {
  passwordSchema,
  changePasswordSchema,
  changeEmailSchema,
  passwordSignInSchema,
  verifyCodeSchema,
} from './auth';

describe('Password contracts', () => {
  it.each(['short1', 'abcdefgh', 'a'.repeat(128) + '1'])(
    'rejects passwords outside policy',
    (password) => {
      expect(passwordSchema.safeParse(password).success).toBe(false);
    },
  );
  it.each(['abcdefg1', 'a'.repeat(127) + '1', ' space 1'])(
    'accepts valid passwords without trimming',
    (password) => {
      expect(passwordSchema.parse(password)).toBe(password);
    },
  );
  it('requires exactly one proof for a password or email change', () => {
    for (const [schema, body] of [
      [changePasswordSchema, { password: 'password1' }],
      [changeEmailSchema, { email: 'rina@example.test' }],
    ] as const) {
      expect(schema.safeParse(body).success).toBe(false);
      expect(
        schema.safeParse({ ...body, currentPassword: 'password1', proofCode: '123456' }).success,
      ).toBe(false);
    }
  });
  it('normalizes the password sign-in identifier', () => {
    expect(
      passwordSignInSchema.parse({ identifier: 'RINA@EXAMPLE.TEST', password: 'unchanged' })
        .identifier,
    ).toBe('rina@example.test');
  });
  it('accepts an optional password only on signup code verification', () => {
    const input = { phone: '01712345678', code: '123456', password: 'password1' };
    expect(verifyCodeSchema.safeParse({ ...input, purpose: 'sign_up' }).success).toBe(true);
    expect(verifyCodeSchema.safeParse({ ...input, purpose: 'sign_in' }).success).toBe(false);
  });
});
