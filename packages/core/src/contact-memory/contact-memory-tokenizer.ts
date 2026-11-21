import type { ContactMemoryTokenCounter } from './contact-memory-rules';

// Counts with the reply model's own tokenizer. A model the library does not know has no counter,
// and memory is then left out of the prompt instead of being measured by a guess.
export async function tokenCounterFor(
  replyModel: string,
): Promise<ContactMemoryTokenCounter | null> {
  try {
    const { encodingForModel } = await import('js-tiktoken');
    // An unknown name throws, which is the unavailable case.
    const encoding = encodingForModel(replyModel as Parameters<typeof encodingForModel>[0]);
    return (text) => encoding.encode(text).length;
  } catch {
    return null;
  }
}
