import type { HandoverRules } from '@dakly/contracts/ai-agent-settings';
import type { ChatClassification } from '@dakly/contracts/chat-classification';
import type { handoverReasons } from '@dakly/contracts/chats';

type Reason = (typeof handoverReasons)[number];

// Each switch the owner turned off lets the model answer that kind of message; with special
// requests off, the classifier's out_of_scope hand-over for a custom or bulk order is dropped. A
// shop that keeps its price lets the model refuse a first discount ask; the screen hands over a
// repeat. An unclear message is left to the model, which asks one question before handing over.
// A shop that takes orders lets the model collect the details of a buyer and handle a yes to an
// order summary; the order tools hand over when the owner turned them off.
export type HandoverCheckRules = HandoverRules & { takesOrders?: boolean };

export function handoverReason(
  texts: string[],
  result: ChatClassification,
  rules: HandoverCheckRules,
): Reason | null {
  if (result.asksForPerson) return 'asked_for_person';
  const text = texts.join('\n').normalize('NFKC').toLowerCase();
  const rule = handoverRules.find(
    ({ intent, pattern, switchName }) =>
      rules[switchName] && (intent === result.intent || pattern.test(text)),
  );
  if (rule) return rule.reason;
  if (result.handover && !isAnsweredByModel(result, rules) && isSwitchedOn(result.handover, rules))
    return result.handover;
  return result.sentiment === 'angry' ? 'angry' : null;
}

function isAnsweredByModel(result: ChatClassification, rules: HandoverCheckRules) {
  const isSpecialAnswered =
    result.intent === 'special_request' &&
    !rules.specialRequests &&
    result.handover === 'out_of_scope';
  return isSpecialAnswered || (result.handover === 'ready_to_buy' && rules.takesOrders === true);
}

const switchOf: Partial<Record<Reason, keyof HandoverRules>> = {
  refund: 'refundsAndExchanges',
  complaint: 'damagedOrWrong',
  discount: 'discounts',
};

const isSwitchedOn = (reason: Reason, rules: HandoverRules) => {
  const switchName = switchOf[reason];
  return switchName === undefined || rules[switchName];
};

const handoverRules: {
  intent?: ChatClassification['intent'];
  pattern: RegExp;
  reason: Reason;
  switchName: keyof HandoverRules;
}[] = [
  {
    intent: 'exchange',
    pattern: /\b(refund|exchange|ferot)\b|ফেরত|বদল/u,
    reason: 'refund',
    switchName: 'refundsAndExchanges',
  },
  {
    intent: 'complaint',
    pattern: /\b(damaged|fake|chera|broken)\b|নকল|ছেঁড়া/u,
    reason: 'complaint',
    switchName: 'damagedOrWrong',
  },
  { pattern: /\b(discount|chhar)\b|ছাড়/u, reason: 'discount', switchName: 'discounts' },
];
