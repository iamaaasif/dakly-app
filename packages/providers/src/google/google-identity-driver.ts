export type GoogleIdentity = {
  subject: string;
  email: string;
  emailIsAuthoritative: boolean;
  name?: string;
};
export type GoogleIdentityDriver = { verify(idToken: string): Promise<GoogleIdentity> };

export class GoogleIdentityError extends Error {
  constructor(readonly code: 'GOOGLE_IDENTITY_INVALID' | 'GOOGLE_IDENTITY_UNAVAILABLE') {
    super(
      code === 'GOOGLE_IDENTITY_INVALID'
        ? 'Google identity could not be verified'
        : 'Google identity verification is unavailable',
    );
    this.name = 'GoogleIdentityError';
  }
}

export function googleIdentity(claims: {
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
  hd?: unknown;
  name?: unknown;
}): GoogleIdentity {
  if (
    typeof claims.sub !== 'string' ||
    !claims.sub ||
    typeof claims.email !== 'string' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email) ||
    claims.email.length > 254 ||
    claims.email_verified !== true
  )
    throw new GoogleIdentityError('GOOGLE_IDENTITY_INVALID');
  const email = claims.email.toLowerCase();
  const name = typeof claims.name === 'string' ? claims.name.trim().slice(0, 120) : '';
  return {
    subject: claims.sub,
    email,
    name: name || undefined,
    emailIsAuthoritative:
      email.endsWith('@gmail.com') || (typeof claims.hd === 'string' && claims.hd.length > 0),
  };
}
