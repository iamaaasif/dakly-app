import { z } from 'zod';

import { signUpCodeChannelSchema } from '@dakly/contracts/auth';

const apiOrigin = z.url().refine((value) => {
  const parsed = new URL(value);
  return parsed.origin === value && ['http:', 'https:'].includes(parsed.protocol);
}, 'WEB_API_URL must be an HTTP origin');
export function webApiUrl(): string {
  return apiOrigin.parse(process.env.WEB_API_URL ?? 'http://localhost:4000');
}

const devHost = z
  .string()
  .regex(
    /^(\*\.)?[a-z0-9.-]+$/i,
    'WEB_ALLOWED_DEV_ORIGINS takes host names such as *.ngrok-free.app',
  );
// Next dev blocks its own assets for hosts other than localhost, which breaks testing through a tunnel.
export function webAllowedDevOrigins(): string[] {
  const hosts = process.env.WEB_ALLOWED_DEV_ORIGINS?.split(',').map((host) => host.trim());
  return z.array(devHost).parse(hosts?.filter(Boolean) ?? []);
}

const publishedUrl = z.url().refine((value) => {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password;
}, 'Legal documents must use published HTTPS URLs');
export function webAuthConfig() {
  const terms = process.env.WEB_TERMS_URL;
  const privacy = process.env.WEB_PRIVACY_URL;
  const version = process.env.WEB_TERMS_VERSION;
  return {
    signupCodeChannel: webSignupCodeChannel(),
    legal:
      terms && privacy && version
        ? {
            termsUrl: publishedUrl.parse(terms),
            privacyUrl: publishedUrl.parse(privacy),
            termsVersion: z.string().trim().min(1).max(100).parse(version),
          }
        : null,
    googleClientId: process.env.WEB_GOOGLE_CLIENT_ID
      ? z
          .string()
          .max(254)
          .regex(/^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/)
          .parse(process.env.WEB_GOOGLE_CLIENT_ID)
      : null,
  };
}

export function webSignupCodeChannel() {
  return signUpCodeChannelSchema.parse(process.env.SIGNUP_CODE_CHANNEL);
}
