// The customer's own yes. A model must not confirm an order on a guess or on text it was shown.
const yes =
  /(?<![\p{L}\p{M}])(yes|yep|yeah|ok|okay|ji|jii|han|haan|hyan|hya|hmm? ok|thik ache|thik achhe|confirm|confirmed|হ্যাঁ|হ্যা|হাঁ|জি|ঠিক আছে|ঠিকাছে|ওকে|কনফার্ম)(?![\p{L}\p{M}])/u;
const no = /(?<![\p{L}\p{M}])(no|not|na|nah|cancel|dont|don't|না|নাহ|বাতিল|থাক)(?![\p{L}\p{M}])/u;

export function customerConfirms(texts: readonly string[]) {
  const text = texts.join('\n').normalize('NFKC').toLowerCase();
  return yes.test(text) && !no.test(text);
}
