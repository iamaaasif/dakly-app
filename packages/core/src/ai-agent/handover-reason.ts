import type { ChatClassification } from '@dakly/contracts/chat-classification';
import type { handoverReasons } from '@dakly/contracts/chats';

type Reason = (typeof handoverReasons)[number];

export function handoverReason(texts: string[], result: ChatClassification): Reason | null {
  if (result.asksForPerson) return 'asked_for_person';
  const text = texts.join('\n').normalize('NFKC').toLowerCase();
  const rule = handoverRules.find(
    ({ intent, pattern }) => intent === result.intent || pattern.test(text),
  );
  if (rule) return rule.reason;
  if (result.handover) return result.handover;
  if (result.sentiment === 'angry') return 'angry';
  return result.confidence === 'low' || result.intent === 'special_request' ? 'out_of_scope' : null;
}

const handoverRules: { intent?: ChatClassification['intent']; pattern: RegExp; reason: Reason }[] =
  [
    { intent: 'exchange', pattern: /\b(refund|exchange|ferot)\b|ফেরত|বদল/u, reason: 'refund' },
    {
      intent: 'complaint',
      pattern: /\b(damaged|fake|chera|broken)\b|নকল|ছেঁড়া/u,
      reason: 'complaint',
    },
    { pattern: /\b(discount|chhar)\b|ছাড়/u, reason: 'discount' },
  ];
