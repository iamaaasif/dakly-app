import type { ChatClassification } from '@dakly/contracts/chat-classification';
import type { handoverReasons } from '@dakly/contracts/chats';

type Reason = (typeof handoverReasons)[number];

// A shop that keeps its price lets the model refuse a first discount ask; the screen hands over a
// repeat. An unclear message is left to the model, which asks one question before handing over.
export function handoverReason(
  texts: string[],
  result: ChatClassification,
  handOverDiscounts: boolean,
): Reason | null {
  if (result.asksForPerson) return 'asked_for_person';
  const text = texts.join('\n').normalize('NFKC').toLowerCase();
  const rule = handoverRules.find(
    ({ intent, pattern, reason }) =>
      (handOverDiscounts || reason !== 'discount') &&
      (intent === result.intent || pattern.test(text)),
  );
  if (rule) return rule.reason;
  if (result.handover && (handOverDiscounts || result.handover !== 'discount'))
    return result.handover;
  return result.sentiment === 'angry' ? 'angry' : null;
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
