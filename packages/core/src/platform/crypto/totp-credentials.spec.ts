import { describe, expect, it } from 'vitest';
import { TOTP, Secret } from 'otpauth';
import { TotpCredentials } from './totp-credentials';

const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const timestamp = 1_800_000;
const token = (time: number) =>
  new TOTP({ secret: Secret.fromBase32(secret) }).generate({ timestamp: time });
describe('TOTP credentials', () => {
  it('accepts only the current step and one step of clock drift', () => {
    const credentials = new TotpCredentials();
    expect(credentials.step(secret, token(timestamp), timestamp)).toBe(60);
    expect(credentials.step(secret, token(timestamp - 30000), timestamp)).toBe(59);
    expect(credentials.step(secret, token(timestamp + 30000), timestamp)).toBe(61);
    expect(credentials.step(secret, token(timestamp - 60000), timestamp)).toBeNull();
    expect(credentials.step(secret, '123', timestamp)).toBeNull();
  });
  it('creates ten distinct random backup codes and a scannable account URI', () => {
    const credentials = new TotpCredentials();
    const setup = credentials.generate('রিনা');
    expect(new URL(setup.uri).protocol).toBe('otpauth:');
    expect(setup.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(new Set(setup.backupCodes).size).toBe(10);
    expect(setup.backupCodes.every((code) => /^[a-f0-9]{20}$/.test(code))).toBe(true);
  });
});
