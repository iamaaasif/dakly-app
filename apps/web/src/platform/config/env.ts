import { z } from 'zod';
const apiOrigin = z.url().refine((value) => {
  const parsed = new URL(value);
  return parsed.origin === value && ['http:', 'https:'].includes(parsed.protocol);
}, 'WEB_API_URL must be an HTTP origin');
export function webApiUrl(): string {
  return apiOrigin.parse(process.env.WEB_API_URL ?? 'http://localhost:4000');
}
