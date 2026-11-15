import { randomBytes, createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { Secret, TOTP } from 'otpauth';

@Injectable()
export class TotpCredentials {
  step(secret: string, token: string, timestamp: number): number | null {
    if (!/^\d{6}$/.test(token)) return null;
    const delta = new TOTP({ secret: Secret.fromBase32(secret) }).validate({
      token,
      timestamp,
      window: 1,
    });
    return delta === null ? null : Math.floor(timestamp / 30000) + delta;
  }

  generate(label: string) {
    const secret = new Secret({ size: 20 });
    return {
      secret: secret.base32,
      uri: new TOTP({ issuer: 'Dakly', label, secret }).toString(),
      backupCodes: Array.from({ length: 10 }, () => randomBytes(10).toString('hex')),
    };
  }

  hashBackup(userId: string, code: string): string {
    return createHash('sha256').update(`${userId}:${code}`).digest('hex');
  }
}
