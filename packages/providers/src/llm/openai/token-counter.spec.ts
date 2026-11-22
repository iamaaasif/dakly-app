import { beforeAll, describe, expect, it } from 'vitest';

import { countOpenAiTokens } from './token-counter';

describe('countOpenAiTokens', () => {
  // The first call loads the o200k ranks table, which can pass the 5 s default on a busy machine.
  beforeAll(async () => {
    await countOpenAiTokens('gpt-6-luna', 'warm up');
  }, 30_000);

  it('counts English text and Bangla text, which takes many more tokens per character', async () => {
    const english = await countOpenAiTokens('gpt-6-luna', 'Prefers size M in red cotton');
    const bangla = await countOpenAiTokens('gpt-6-luna', 'লাল সুতির কুর্তি এম সাইজ পছন্দ');
    expect(english).toBeGreaterThan(3);
    expect(english).toBeLessThan(12);
    expect(bangla).toBeGreaterThan(12);
  });

  it('counts a special-token name in customer text as ordinary text', async () => {
    expect(await countOpenAiTokens('gpt-6-luna', '<|endoftext|>')).toBeGreaterThan(1);
  });

  it('has no count for a model whose tokenizer is not known', async () => {
    expect(await countOpenAiTokens('claude-fable-5-2', 'hello')).toBeUndefined();
  });
});
