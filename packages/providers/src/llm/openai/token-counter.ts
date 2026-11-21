let encoder: ReturnType<typeof loadEncoder> | undefined;

// js-tiktoken ships types for ES modules only, so it is loaded with a dynamic import.
async function loadEncoder() {
  const [{ Tiktoken: Encoder }, { default: ranks }] = await Promise.all([
    import('js-tiktoken/lite'),
    import('js-tiktoken/ranks/o200k_base'),
  ]);
  return new Encoder(ranks);
}

// o200k_base is the encoding of the current OpenAI chat models. A name that does not look like
// one of them has no known tokenizer, so the caller must not guess a count.
export async function countOpenAiTokens(model: string, text: string): Promise<number | undefined> {
  if (!model.startsWith('gpt-')) return undefined;
  encoder ??= loadEncoder();
  // Customer text may hold special-token names; they are counted as ordinary text.
  return (await encoder).encode(text, [], []).length;
}
