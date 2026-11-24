import type { replyLanguages } from '@dakly/contracts/ai';

const banglaLetters = /[ঀ-৿]/u;

const bangla =
  'দুঃখিত, এ বিষয়ে আমি সাহায্য করতে পারব না। আমাদের পণ্য, দাম, ডেলিভারি বা অর্ডার নিয়ে যেকোনো প্রশ্ন করতে পারেন।';
const english =
  'Sorry, I can’t help with that. You can ask me about our products, prices, delivery or orders.';

// A message that tries to change the rules or is not about the shop needs no person, so it gets
// this fixed line and the chat stays with the AI. It is fixed so an attack cannot shape it.
export function declineReply(replyLanguage: (typeof replyLanguages)[number], texts: string[]) {
  if (replyLanguage === 'bn') return bangla;
  if (replyLanguage === 'en') return english;
  return texts.some((text) => banglaLetters.test(text)) ? bangla : english;
}

const holdingBangla = 'আপনার বিষয়টি নোট করা হয়েছে। আমাদের টিম খুব শীঘ্রই আপনার সাথে কথা বলবে।';
const holdingEnglish = 'We have noted your request. Our team will talk to you very soon.';

// The line a customer reads when a person takes over. It promises nothing but a reply.
export const holdingReply = (replyLanguage: (typeof replyLanguages)[number]) =>
  replyLanguage === 'en' ? holdingEnglish : holdingBangla;
