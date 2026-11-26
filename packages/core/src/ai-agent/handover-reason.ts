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
// shop has already replied twice in this chat, so a customer is never kept going round. An angry
// customer wins over a matched refund or complaint rule, because the hand-over reason tells staff
// how to open the chat, and anger is the thing to meet first.
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

const alternatives = (words: string[]) => words.join('|');

// A bare policy word ("exchange policy ki?") must not hand over, so each rule needs a demand, a
// report or a verb next to the word. To cover another phrasing, add a word to a list below.
const refundWords = 'refund|exchange|return';
const refundAskers = ['want', 'need', 'give', 'issue', 'process'];
const refundEnglishEndings = [
  'chai',
  'chay',
  'den',
  'din',
  'dao',
  'lagbe',
  'korbo',
  'korte\\s*chai',
  'deben',
  'dite\\s*hobe',
  'korun',
  'koren',
];
const refundBanglaWords = ['টাকা\\s*ফেরত', 'রিফান্ড', 'ফেরত', 'বদল'];
const refundBanglaEndings = [
  'চাই',
  'দিন',
  'দাও',
  'দেন',
  'লাগবে',
  'করব',
  'করবো',
  'করতে\\s*চাই',
  'করুন',
  'দেব',
  'দেবো',
  'দিব',
  'দিবো',
];
const refundDemand = new RegExp(
  [
    String.raw`\b(?:${alternatives(refundAskers)})\s+(?:a\s+)?(?:${refundWords})\b`,
    String.raw`\b(?:taka\s*ferot|refund|exchange|ferot)\s*(?:${alternatives(refundEnglishEndings)})\b`,
    `(?:${alternatives(refundBanglaWords)})\\s*(?:${alternatives(refundBanglaEndings)})`,
    'এটা\\s*(?:ফেরত|বদল)',
  ].join('|'),
  'u',
);

const damageWords = ['damaged', 'broken', 'fake', 'chera'];
const damageReportEndings = [
  'ashche',
  'asce',
  'esechhe',
  'eseche',
  'peyechi',
  'peyeci',
  'diyechhe',
  'diyeche',
  'dise',
  'pathaise',
  'pathiyeche',
];
const damageReport = new RegExp(
  [
    String.raw`\b(?:received|came|is|was|looks|got)\s+(?:a\s+)?(?:${alternatives(damageWords)})\b`,
    String.raw`\b(?:damaged|broken|chera)\s+(?:${alternatives(damageReportEndings)})\b`,
    String.raw`\b(?:eta|aita|product|kapor)\s+(?:${alternatives(damageWords)})\b`,
    'নকল\\s*(?:দিয়েছে|দিছে|পাঠাইছে|পণ্য)|ছেঁড়া|ভাঙা',
  ].join('|'),
  'u',
);

const discountWords = 'discount|chhar';
const discountEnglishEndings = [
  'den',
  'din',
  'dao',
  'diben',
  'deben',
  'pabo',
  'lagbe',
  'chai',
  'chay',
  'koren',
  'korun',
];
const discountBanglaEndings = [
  'দিন',
  'দাও',
  'দেন',
  'দেওয়া',
  'পাব',
  'পাবো',
  'চাই',
  'লাগবে',
  'দিবেন',
  'করুন',
  'করেন',
];
const discountDemand = new RegExp(
  [
    String.raw`\b(?:get|give|want|need)\s+(?:a\s+|any\s+)?(?:${discountWords})\b`,
    String.raw`\b(?:${discountWords})\s+(?:${alternatives(discountEnglishEndings)})\b`,
    `ছাড়\\s*(?:${alternatives(discountBanglaEndings)})`,
  ].join('|'),
  'u',
);

const handoverRules: {
  intent?: ChatClassification['intent'];
  pattern: RegExp;
  reason: Reason;
  switchName: keyof HandoverRules;
}[] = [
  {
    intent: 'exchange',
    pattern: refundDemand,
    reason: 'refund',
    switchName: 'refundsAndExchanges',
  },
  {
    intent: 'complaint',
    pattern: damageReport,
    reason: 'complaint',
    switchName: 'damagedOrWrong',
  },
  {
    pattern: discountDemand,
    reason: 'discount',
    switchName: 'discounts',
  },
];
