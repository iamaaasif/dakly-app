import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { loadEnv } from '../platform/config/env';
import type { StaffIdentity } from '@dakly/contracts/staff-auth';
export const staffTokenHash = (token: string) => createHash('sha256').update(token).digest();
export const newStaffProof = () => randomBytes(32).toString('base64url');
@Injectable()
export class StaffTokens {
  private readonly key = loadEnv().STAFF_SESSION_SIGNING_KEY;
  async issue(staff: StaffIdentity, sessionId: string, now: Date): Promise<string> {
    if (!this.key) throw new Error('Staff session signing key is required');
    const { SignJWT } = await import('jose');
    return new SignJWT({ role: staff.role })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(staff.id)
      .setJti(sessionId)
      .setIssuer('dakly-staff')
      .setAudience('dakly-admin')
      .setIssuedAt(Math.floor(now.getTime() / 1000))
      .setExpirationTime(Math.floor(now.getTime() / 1000) + 28800)
      .sign(Buffer.from(this.key, 'base64'));
  }
  async verify(
    token: string,
    now: Date,
  ): Promise<{ staffUserId: string; sessionId: string } | undefined> {
    if (!this.key) return undefined;
    try {
      const { jwtVerify } = await import('jose');
      const { payload } = await jwtVerify(token, Buffer.from(this.key, 'base64'), {
        issuer: 'dakly-staff',
        audience: 'dakly-admin',
        algorithms: ['HS256'],
        currentDate: now,
        requiredClaims: ['sub', 'jti', 'exp', 'iat'],
      });
      if (!payload.sub || !payload.jti) return undefined;
      return { staffUserId: payload.sub, sessionId: payload.jti };
    } catch {
      return undefined;
    }
  }
}
