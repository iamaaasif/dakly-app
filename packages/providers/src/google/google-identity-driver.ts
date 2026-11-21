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

function displayName(claim: unknown): string | undefined {
  return typeof claim === 'string' ? claim.trim().slice(0, 120) || undefined : undefined;
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
  return {
    subject: claims.sub,
    email,
    name: displayName(claims.name),
    emailIsAuthoritative:
      email.endsWith('@gmail.com') ||
      email.endsWith('@googlemail.com') ||
      (typeof claims.hd === 'string' && claims.hd.length > 0),
  };
}
