// Standard-tier prices from https://developers.openai.com/api/docs/pricing (short context), in
// micro-USD per million tokens, the same unit as AI_MODEL_PRICES. Checked 2026-11-21.
export type ModelPrice = { input: number; cachedInput: number; output: number };

export const candidatePrices: Record<string, ModelPrice> = {
  'gpt-6-luna': { input: 100_000, cachedInput: 10_000, output: 500_000 },
  'gpt-5.6-luna': { input: 200_000, cachedInput: 20_000, output: 1_200_000 },
  'gpt-6.1-terra': { input: 1_000_000, cachedInput: 50_000, output: 5_000_000 },
  'gpt-5.6-terra': { input: 2_000_000, cachedInput: 200_000, output: 12_000_000 },
  'gpt-6-sol': { input: 2_000_000, cachedInput: 200_000, output: 10_000_000 },
  'gpt-6.1-sol': { input: 2_000_000, cachedInput: 100_000, output: 10_000_000 },
  'gpt-6.2-sol': { input: 2_000_000, cachedInput: 100_000, output: 10_000_000 },
  'gpt-5.6-sol': { input: 4_000_000, cachedInput: 400_000, output: 20_000_000 },
  'gpt-6.2-astra': { input: 8_000_000, cachedInput: 400_000, output: 40_000_000 },
  'gpt-6-astra': { input: 10_000_000, cachedInput: 1_000_000, output: 50_000_000 },
  'text-embedding-3-small': { input: 20_000, cachedInput: 0, output: 0 },
  'text-embedding-3-large': { input: 130_000, cachedInput: 0, output: 0 },
};

// Transcription is billed per minute of audio, in micro-USD.
export const transcribePerMinute: Record<string, number> = {
  'gpt-transcribe': 4_500,
  'gpt-4o-transcribe': 6_000,
  'gpt-4o-mini-transcribe': 3_000,
  'whisper-1': 6_000,
};

type Usage = { inputTokens: number; cachedInputTokens: number; outputTokens: number };

export function costMicroUsd(model: string, usage: Usage): number {
  const price = candidatePrices[model];
  if (!price) throw new Error(`No price for ${model}`);
  const uncached = usage.inputTokens - usage.cachedInputTokens;
  return (
    (uncached * price.input +
      usage.cachedInputTokens * price.cachedInput +
      usage.outputTokens * price.output) /
    1_000_000
  );
}
