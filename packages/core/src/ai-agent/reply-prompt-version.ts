import { adProductsVersion } from './ad-context';
import { productsInChatVersion } from './chat-memory';

// A run that was shown the products block records its version with the reply prompt's.
export function promptWith(
  prompt: { version: string; instructions: string },
  inChat: object | undefined,
  ad: object | undefined,
) {
  const parts = [
    prompt.version,
    ...(inChat ? [productsInChatVersion] : []),
    ...(ad ? [adProductsVersion] : []),
  ];
  return { ...prompt, version: parts.join('+') };
}
