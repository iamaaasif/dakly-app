import type { replyLanguages } from '@dakly/contracts/ai';

const banglaLetters = /[ঀ-৿]/u;

const bangla =
  'দুঃখিত, এই বিষয়ে সাহায্য করতে পারছি না। আমাদের পণ্য, দাম বা ডেলিভারি নিয়ে কিছু জানতে চাইলে বলুন।';
const english =
  'Sorry, I can’t help with that. Let me know if you have any questions about our products, prices, or delivery.';

// A message that tries to change the rules or is not about the shop needs no person, so it gets
// this fixed line and the chat stays with the AI. It is fixed so an attack cannot shape it.
export function declineReply(replyLanguage: (typeof replyLanguages)[number], texts: string[]) {
  if (replyLanguage === 'bn') return bangla;
  if (replyLanguage === 'en') return english;
  return texts.some((text) => banglaLetters.test(text)) ? bangla : english;
}

const holdingBangla = 'নোট করে রাখলাম। আমাদের টিম থেকে একটু পরই আপনার সাথে কথা বলবে।';
const holdingEnglish = 'Got it, I passed this to our team. Someone will reply here shortly.';

// The line a customer reads when a person takes over. It promises nothing but a reply.
export const holdingReply = (replyLanguage: (typeof replyLanguages)[number]) =>
  replyLanguage === 'en' ? holdingEnglish : holdingBangla;
