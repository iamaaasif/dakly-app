import { z } from 'zod';
const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  ADMIN_ORIGIN: z.url().default('http://localhost:3010'),
  ADMIN_API_URL: z.url().default('http://localhost:4000'),
  CLOUDFLARE_ACCESS_ISSUER: z.url().regex(/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/),
  CLOUDFLARE_ACCESS_AUDIENCE: z.string().min(1),
  CLOUDFLARE_ACCESS_DEVELOPMENT_JWKS: z.string().optional(),
});
export function adminEnvironment() {
  const env = schema.parse(process.env);
  if (
    env.NODE_ENV === 'production' &&
    (env.CLOUDFLARE_ACCESS_DEVELOPMENT_JWKS || !env.ADMIN_ORIGIN.startsWith('https://'))
  )
    throw new Error('Production requires Cloudflare Access and HTTPS');
  return env;
}

export function adminApiUrl(): string {
  return z.url().parse(process.env.ADMIN_API_URL ?? 'http://localhost:4000');
}
