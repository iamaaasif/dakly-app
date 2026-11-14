export type GoogleIdentity = { subject: string; email: string; emailIsAuthoritative: boolean };
export type GoogleIdentityDriver = { verify(idToken: string): Promise<GoogleIdentity> };

export function googleIdentity(claims: {
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
  hd?: unknown;
}): GoogleIdentity {
  if (
    typeof claims.sub !== 'string' ||
    !claims.sub ||
    typeof claims.email !== 'string' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email) ||
    claims.email.length > 254 ||
    claims.email_verified !== true
  )
    throw new Error('Google identity could not be verified');
  const email = claims.email.toLowerCase();
  return {
    subject: claims.sub,
    email,
    emailIsAuthoritative:
      email.endsWith('@gmail.com') || (typeof claims.hd === 'string' && claims.hd.length > 0),
  };
}
