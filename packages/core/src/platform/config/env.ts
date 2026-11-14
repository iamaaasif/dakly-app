import { z } from 'zod';
import { trustedProxiesSchema } from './trusted-proxies';
import { parseEncryptionConfiguration, type EncryptionConfiguration } from './encryption-config';
import { redisUrlSchema } from '../queue/redis-connection';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.url(),
  REDIS_URL: redisUrlSchema,
  EMAIL_DRIVER: z.enum(['smtp', 'sendgrid']).optional(),
  EMAIL_FROM: z.email().optional(),
  SENDGRID_API_KEY: z.string().min(1).optional(),
  GOOGLE_IDENTITY_DRIVER: z.enum(['fake', 'google']).optional(),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  SMS_DRIVER: z.literal('mailpit').optional(),
  MAILPIT_SMTP_HOST: z.string().min(1).default('127.0.0.1'),
  MAILPIT_SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
  SENTRY_DSN: z.url().optional(),
  SLACK_BOT_TOKEN: z.string().min(1).optional(),
  SLACK_CHANNEL_ID: z
    .string()
    .regex(/^[CG][A-Z0-9]+$/)
    .optional(),
  WEB_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((value) => value.split(',').map((origin) => origin.trim()))
    .pipe(z.array(z.url().refine((value) => new URL(value).origin === value)).min(1)),
  ADMIN_ORIGIN: z
    .url()
    .refine((value) => new URL(value).origin === value)
    .default('http://localhost:3010'),
  CLOUDFLARE_ACCESS_ISSUER: z
    .url()
    .refine((value) => /^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(value))
    .optional(),
  CLOUDFLARE_ACCESS_AUDIENCE: z.string().min(1).optional(),
  CLOUDFLARE_ACCESS_DEVELOPMENT_JWKS: z.string().optional(),
  STAFF_SESSION_SIGNING_KEY: z
    .string()
    .regex(/^[A-Za-z0-9+/]{43}=$/)
    .optional(),
  API_TRUSTED_PROXIES: trustedProxiesSchema,
  API_HOST: z.union([z.ipv4(), z.ipv6()]).default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().default(4000),
});

export type Env = z.infer<typeof envSchema> & { encryption: EncryptionConfiguration | undefined };

// Fails at startup, not at the first request, when a variable is missing.
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const env = envSchema.parse(source);
  if (env.NODE_ENV === 'production' && env.SMS_DRIVER === 'mailpit') {
    throw new Error('SMS_DRIVER=mailpit is not allowed in production');
  }
  if (env.NODE_ENV === 'production' && env.GOOGLE_IDENTITY_DRIVER === 'fake')
    throw new Error('Fake Google identity is not allowed in production');
  if (env.GOOGLE_IDENTITY_DRIVER === 'google' && !env.GOOGLE_CLIENT_ID)
    throw new Error('GOOGLE_CLIENT_ID is required for Google identity');
  if (env.NODE_ENV === 'production' && env.CLOUDFLARE_ACCESS_DEVELOPMENT_JWKS)
    throw new Error('Development Access keys are not allowed in production');
  return {
    ...env,
    encryption: parseEncryptionConfiguration(
      source.ENCRYPTION_CURRENT_KEY_VERSION,
      source.ENCRYPTION_MASTER_KEYS,
    ),
  };
}

export function loadStaffEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const env = loadEnv(source);
  if (env.WEB_ORIGINS.includes(env.ADMIN_ORIGIN))
    throw new Error('Admin and shop origins must differ');

  if (env.NODE_ENV === 'production') {
    if (
      !env.CLOUDFLARE_ACCESS_ISSUER ||
      !env.CLOUDFLARE_ACCESS_AUDIENCE ||
      !env.STAFF_SESSION_SIGNING_KEY
    )
      throw new Error('Staff Access and session configuration is required in production');
    if (!env.ADMIN_ORIGIN.startsWith('https://'))
      throw new Error('Admin origin must use HTTPS in production');
  }
  return env;
}
