import type { aiRatingReasons } from '@dakly/contracts/ai-feedback';

export const feedbackReasonLabels: Record<(typeof aiRatingReasons)[number], string> = {
  wrong_information: 'Wrong information',
  wrong_price_or_stock: 'Wrong price or stock',
  too_long: 'Too long',
  not_our_tone: 'Not our tone',
  missed_the_question: 'Missed the question',
  should_have_handed_over: 'Should have handed to me',
};
