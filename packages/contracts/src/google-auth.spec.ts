import { describe, expect, it } from 'vitest';

import { googleSignInSchema, verifyCodeSchema, verifyGoogleEmailSchema } from './auth';

describe('Google sign-in contracts', () => {
  it('accepts a bounded token without accepting client identity claims', () => {
    expect(googleSignInSchema.safeParse({ idToken: 'id-token' }).success).toBe(true);
    expect(
      googleSignInSchema.safeParse({ idToken: 'id-token', email: 'victim@example.test' }).success,
    ).toBe(false);
    expect(googleSignInSchema.safeParse({ idToken: 'x'.repeat(16385) }).success).toBe(false);
  });
  it('accepts a ticket only with signup mobile verification', () => {
    const input = {
      purpose: 'sign_up',
      phone: '01712345678',
      code: '123456',
      signupTicket: 'x'.repeat(43),
    };
    expect(verifyCodeSchema.safeParse(input).success).toBe(true);
    expect(verifyCodeSchema.safeParse({ ...input, purpose: 'sign_in' }).success).toBe(false);
    expect(verifyCodeSchema.safeParse({ ...input, googleSubject: 'client-subject' }).success).toBe(
      false,
    );
  });
  it('requires an opaque ticket and code without client supplied subject or email', () => {
    const input = { verificationTicket: 'x'.repeat(43), code: '123456' };
    expect(verifyGoogleEmailSchema.safeParse(input).success).toBe(true);
    expect(
      verifyGoogleEmailSchema.safeParse({ ...input, email: 'victim@example.test' }).success,
    ).toBe(false);
    expect(
      verifyGoogleEmailSchema.safeParse({ ...input, verificationTicket: 'short' }).success,
    ).toBe(false);
  });
});
