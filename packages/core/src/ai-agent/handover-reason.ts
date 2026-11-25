import type { HandoverRules } from '@dakly/contracts/ai-agent-settings';
import type { ChatClassification } from '@dakly/contracts/chat-classification';
import type { handoverReasons } from '@dakly/contracts/chats';

type Reason = (typeof handoverReasons)[number];

// Each switch the owner turned off lets the model answer that kind of message; with special
// requests off, the classifier's out_of_scope hand-over for a custom or bulk order is dropped. A
// shop that keeps its price lets the model refuse a first discount ask; the screen hands over a
// repeat. An unclear message is left to the model, which asks one question before handing over.
// A shop that takes orders lets the model collect the details of a buyer and handle a yes to an
// order summary; the order tools hand over when the owner turned them off. Only a custom or bulk
// order is out of scope for the classifier: any other question is left to the model, which has the
// shop's settings and knowledge, so a question the classifier cannot place never waits for a person.
// A complaint, refund or angry message is first taken in by the model, which apologises, asks for
// the order and looks it up, then hands over with a summary. The screen steps in only when the
// shop has already replied twice in this chat, so a customer is never kept going round.
export type HandoverCheckRules = HandoverRules & { takesOrders?: boolean; shopReplies?: number };

const MODEL_TAKES_IN_REPLIES = 2;
const isTakenInByModel = (reason: Reason, rules: HandoverCheckRules) =>
  (reason === 'complaint' || reason === 'refund' || reason === 'angry') &&
  (rules.shopReplies ?? 0) < MODEL_TAKES_IN_REPLIES;

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
  const reason =
    result.sentiment === 'angry' || result.handover === 'angry'
      ? 'angry'
      : (rule?.reason ?? classifierReason(result, rules));
  return reason && !isTakenInByModel(reason, rules) ? reason : null;
}

function classifierReason(result: ChatClassification, rules: HandoverCheckRules): Reason | null {
  if (result.handover && !isLeftToModel(result, rules) && isSwitchedOn(result.handover, rules))
    return result.handover;
  return result.sentiment === 'angry' ? 'angry' : null;
}

function isLeftToModel(result: ChatClassification, rules: HandoverCheckRules) {
  if (result.handover === 'ready_to_buy') return rules.takesOrders === true;
  if (result.handover !== 'out_of_scope') return false;
  const isCustomOrder = result.intent === 'special_request' && rules.specialRequests;
  // The shop already asked what the customer means, so a person takes the second unclear message.
  return !(isCustomOrder || (rules.shopReplies ?? 0) >= 1);
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
    pattern:
      /\b(?:want|need|give|issue|process)\s+(?:a\s+)?(?:refund|exchange|return)\b|\b(?:taka\s*ferot|refund|exchange|ferot)\s*(?:chai|chay|den|din|dao|lagbe|korbo|korte\s*chai|deben|dite\s*hobe|korun|koren)\b|(?:টাকা\s*ফেরত|রিফান্ড|ফেরত|বদল)\s*(?:চাই|দিন|দাও|দেন|লাগবে|করব|করবো|করতে\s*চাই|করুন|দেব|দেবো|দিব|দিবো)|এটা\s*(?:ফেরত|বদল)/u,
    reason: 'refund',
    switchName: 'refundsAndExchanges',
  },
  {
    intent: 'complaint',
    pattern:
      /\b(?:received|came|is|was|looks|got)\s+(?:a\s+)?(?:damaged|broken|fake|chera)\b|\b(?:damaged|broken|chera)\s+(?:ashche|asce|esechhe|eseche|peyechi|peyeci|diyechhe|diyeche|dise|pathaise|pathiyeche)\b|\b(?:eta|aita|product|kapor)\s+(?:fake|chera|broken|damaged)\b|নকল\s*(?:দিয়েছে|দিছে|পাঠাইছে|পণ্য)|ছেঁড়া|ভাঙা/u,
    reason: 'complaint',
    switchName: 'damagedOrWrong',
  },
  {
    pattern:
      /\b(?:get|give|want|need)\s+(?:a\s+|any\s+)?(?:discount|chhar)\b|\b(?:discount|chhar)\s+(?:den|din|dao|diben|deben|pabo|lagbe|chai|chay|koren|korun)\b|ছাড়\s*(?:দিন|দাও|দেন|দেওয়া|পাব|পাবো|চাই|লাগবে|দিবেন|করুন|করেন)/u,
    reason: 'discount',
    switchName: 'discounts',
  },
];
