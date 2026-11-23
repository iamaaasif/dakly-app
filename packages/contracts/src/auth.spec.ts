import { describe, expect, it } from 'vitest';

import { requestCodeSchema, verifyCodeSchema } from './auth';

const signup = {
  purpose: 'sign_up',
  phone: '+880 1712-345678',
  name: ' রিনা ',
  termsVersion: '2026-11',
};
describe('SMS authentication contracts', () => {
  it('normalizes the phone and name while leaving email optional', () => {
    expect(requestCodeSchema.parse(signup)).toEqual({
      purpose: 'sign_up',
      phone: '01712345678',
      name: 'রিনা',
      termsVersion: '2026-11',
    });
  });
  it.each([
    { name: '' },
    { termsVersion: '' },
    { phone: '123' },
    { email: 'wrong' },
    { emailVerifiedAt: '2026-01-01' },
  ])('rejects invalid signup fields %j', (change) => {
    expect(requestCodeSchema.safeParse({ ...signup, ...change }).success).toBe(false);
  });
  it('accepts how the owner heard about Dakly and rejects an unknown source', () => {
    expect(
      requestCodeSchema.parse({ ...signup, source: 'other', sourceOther: ' a friend ' }),
    ).toMatchObject({ source: 'other', sourceOther: 'a friend' });
    expect(requestCodeSchema.safeParse({ ...signup, source: 'newspaper' }).success).toBe(false);
  });
  it.each(['12345', '1234567', '12a456'])('rejects malformed verification code %s', (code) => {
    expect(
      verifyCodeSchema.safeParse({ purpose: 'sign_in', phone: signup.phone, code }).success,
    ).toBe(false);
  });
  it('accepts a six digit code with leading zeroes and defaults to a temporary session', () => {
    expect(
      verifyCodeSchema.parse({ purpose: 'sign_in', phone: signup.phone, code: '000012' })
        .isRemembered,
    ).toBe(false);
  });
});
