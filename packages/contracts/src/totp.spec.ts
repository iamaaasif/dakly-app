import { describe, expect, it } from 'vitest';

import { totpRecoveryCodeSchema, totpRecoverySchema } from './totp';

describe('two-step recovery contracts', () => {
  it('accepts a verified email with its code and no mobile', () => {
    expect(totpRecoverySchema.parse({ email: 'Owner@Example.com', emailCode: '123456' })).toEqual({
      email: 'owner@example.com',
      emailCode: '123456',
    });
  });
  it('still needs the mobile code when a mobile is given', () => {
    expect(totpRecoverySchema.safeParse({ phone: '01712345678' }).success).toBe(false);
    expect(
      totpRecoverySchema.safeParse({ phone: '01712345678', phoneCode: '123456' }).success,
    ).toBe(true);
  });
  it('needs exactly one of mobile or email', () => {
    expect(totpRecoverySchema.safeParse({ emailCode: '123456' }).success).toBe(false);
    expect(
      totpRecoverySchema.safeParse({
        phone: '01712345678',
        email: 'a@example.com',
        phoneCode: '123456',
      }).success,
    ).toBe(false);
  });
  it('sends a mobile code only to a mobile', () => {
    expect(
      totpRecoveryCodeSchema.safeParse({ email: 'a@example.com', method: 'phone' }).success,
    ).toBe(false);
    expect(
      totpRecoveryCodeSchema.safeParse({ email: 'a@example.com', method: 'email' }).success,
    ).toBe(true);
  });
});
