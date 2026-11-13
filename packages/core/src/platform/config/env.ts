import { z } from 'zod';
import { redisUrlSchema } from '../queue/redis-connection';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.url(),
  REDIS_URL: redisUrlSchema,
  SENTRY_DSN: z.url().optional(),
  API_PORT: z.coerce.number().int().positive().default(4000),
});

export type Env = z.infer<typeof envSchema>;

// Fails at startup, not at the first request, when a variable is missing.
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source);
}
