import type { JSONWebKeySet, JWTVerifyGetKey } from 'jose' with { 'resolution-mode': 'import' };

export type AccessIdentity = { subject: string; email: string };
export type AccessConfiguration = {
  issuer: string;
  audience: string;
  developmentKeys?: JSONWebKeySet;
};
export class CloudflareAccessDriver {
  private keys?: JWTVerifyGetKey;
  constructor(private readonly configuration: AccessConfiguration) {}
  async verify(assertion: string): Promise<AccessIdentity> {
    try {
      const { createLocalJWKSet, createRemoteJWKSet, jwtVerify } = await import('jose');
      this.keys ??= this.configuration.developmentKeys
        ? createLocalJWKSet(this.configuration.developmentKeys)
        : createRemoteJWKSet(new URL('/cdn-cgi/access/certs', this.configuration.issuer), {
            timeoutDuration: 5000,
          });
      const { payload } = await jwtVerify(assertion, this.keys, {
        issuer: this.configuration.issuer,
        audience: this.configuration.audience,
        algorithms: ['RS256'],
        requiredClaims: ['exp', 'iat', 'sub', 'email', 'type'],
      });
      return humanIdentity(payload);
    } catch {
      throw new Error('Access assertion is invalid');
    }
  }
}

function humanIdentity(payload: {
  sub?: unknown;
  email?: unknown;
  type?: unknown;
  common_name?: unknown;
}): AccessIdentity {
  if (
    payload.type !== 'app' ||
    payload.common_name !== undefined ||
    typeof payload.sub !== 'string' ||
    !payload.sub ||
    payload.sub.length > 255 ||
    typeof payload.email !== 'string' ||
    payload.email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)
  )
    throw new Error('Access assertion is invalid');
  return { subject: payload.sub, email: payload.email.toLowerCase() };
}
