// The customer's own yes. A model must not confirm an order on a guess or on text it was shown.
const yes =
  /(?<![\p{L}\p{M}])(yes|yep|yeah|ok|okay|ji|jii|han|haan|hyan|hya|thik ache|thik achhe|confirm|confirmed|হ্যাঁ|হ্যা|হাঁ|জি|ঠিক আছে|ঠিকাছে|ওকে|কনফার্ম)(?![\p{L}\p{M}])/u;
// "না" ends many yeses ("দেরি করবেন না"), so a bare no counts only as the whole message.
const refusal =
  /^[\s.!]*(no|nah|na|না|নাহ)[\s.!]*$|\b(cancel|dont|don't|do not|lagbe na|nibo na|dorkar nai)\b|বাতিল|লাগবে না|নিব না|নেব না|দরকার নেই/u;

export function customerConfirms(texts: readonly string[]) {
  const normalized = texts.map((text) => text.normalize('NFKC').toLowerCase());
  return (
    normalized.some((text) => yes.test(text)) && !normalized.some((text) => refusal.test(text))
  );
}
