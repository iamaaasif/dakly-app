import { describe, expect, it } from 'vitest';
import { staffEnrollmentSchema, staffProvisionSchema, staffSignInSchema } from './staff-auth';
describe('Staff authentication contracts', () => {
  it('rejects public identity or role injection during enrollment', () => {
    expect(
      staffEnrollmentSchema.safeParse({
        proof: 'a'.repeat(43),
        password: 'correct123',
        factor: 'totp',
        role: 'super_admin',
      }).success,
    ).toBe(false);
  });
  it('requires attested personal contact information for provisioning', () => {
    expect(
      staffProvisionSchema.safeParse({
        email: 'staff@example.test',
        name: 'Rina',
        role: 'support',
        accessSubject: 'idp-subject',
        reason: 'Checked staff identity',
      }).success,
    ).toBe(false);
  });
  it('normalizes sign-in email without accepting a phone sign-in', () => {
    expect(
      staffSignInSchema.parse({ email: 'Staff@example.test', password: 'password' }).email,
    ).toBe('staff@example.test');
    expect(
      staffSignInSchema.safeParse({ email: '01712345678', password: 'password' }).success,
    ).toBe(false);
  });
});
