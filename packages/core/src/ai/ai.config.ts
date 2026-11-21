import { z } from 'zod';

import { loadEnv } from '../platform/config/env';
import { aiError } from './ai.errors';

export const AI_CONFIG = Symbol('AI_CONFIG');
export const LLM_DRIVER = Symbol('LLM_DRIVER');
export const aiTimeoutMs = 20_000;

export type AiTier = 'reply' | 'fast' | 'vision' | 'writer';

const pricesByModel = z.record(
  z.string().min(1),
  z.object({
    input: z.int().nonnegative(),
    cachedInput: z.int().nonnegative(),
    output: z.int().nonnegative(),
  }),
);

export type AiConfig = {
  models: Record<AiTier, string>;
  embeddingModel: string;
  transcribeModel: string;
  prices: z.infer<typeof pricesByModel>;
};

const standardPrices: AiConfig['prices'] = {
  'text-embedding-3-small': { input: 20_000, cachedInput: 0, output: 0 },
  'text-embedding-3-large': { input: 130_000, cachedInput: 0, output: 0 },
  'gpt-4o-transcribe': { input: 6_000_000, cachedInput: 0, output: 10_000_000 },
  'gpt-6.1-terra': { input: 1_000_000, cachedInput: 50_000, output: 5_000_000 },
  'gpt-6-luna': { input: 100_000, cachedInput: 10_000, output: 500_000 },
};

export function loadAiConfig(): AiConfig {
  const env = loadEnv();
  const models = {
    reply: env.AI_REPLY_MODEL,
    fast: env.AI_FAST_MODEL,
    vision: env.AI_VISION_MODEL,
    writer: env.AI_WRITER_MODEL,
  };
  let prices: AiConfig['prices'];
  try {
    prices = { ...standardPrices, ...pricesByModel.parse(JSON.parse(env.AI_MODEL_PRICES)) };
  } catch {
    throw aiError('AI_CONFIG_INVALID');
  }
  if (
    env.LLM_DRIVER === 'openai' &&
    [...Object.values(models), env.AI_EMBEDDING_MODEL, env.AI_TRANSCRIBE_MODEL].some(
      (model) => !Object.hasOwn(prices, model),
    )
  )
    throw aiError('AI_CONFIG_INVALID');
  return {
    models,
    embeddingModel: env.AI_EMBEDDING_MODEL,
    transcribeModel: env.AI_TRANSCRIBE_MODEL,
    prices,
  };
}
