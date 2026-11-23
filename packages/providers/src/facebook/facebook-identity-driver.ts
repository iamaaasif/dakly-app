export type FacebookIdentity = { subject: string; email?: string; name?: string };
export type FacebookIdentityDriver = {
  // The Facebook page the browser is sent to, which comes back to the redirect URI with a code.
  authorizeUrl(state: string): string;
  identify(code: string): Promise<FacebookIdentity>;
};

export class FacebookIdentityError extends Error {
  constructor(readonly code: 'FACEBOOK_IDENTITY_INVALID' | 'FACEBOOK_IDENTITY_UNAVAILABLE') {
    super(
      code === 'FACEBOOK_IDENTITY_INVALID'
        ? 'Facebook identity could not be verified'
        : 'Facebook identity verification is unavailable',
    );
    this.name = 'FacebookIdentityError';
  }
}

export function facebookIdentity(profile: {
  id?: unknown;
  name?: unknown;
  email?: unknown;
}): FacebookIdentity {
  if (typeof profile.id !== 'string' || !/^\d{1,30}$/.test(profile.id))
    throw new FacebookIdentityError('FACEBOOK_IDENTITY_INVALID');
  // Facebook shares only an email the person has confirmed; a person may share none.
  const email =
    typeof profile.email === 'string' &&
    profile.email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)
      ? profile.email.toLowerCase()
      : undefined;
  const name = typeof profile.name === 'string' ? profile.name.trim().slice(0, 120) : '';
  return { subject: profile.id, email, name: name || undefined };
}
