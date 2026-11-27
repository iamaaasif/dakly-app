import type { handoverReasons } from '@dakly/contracts/chats';

// Short words for why Dakly AI handed a chat to the team, shown on the row and the banner.
export const handoverReasonLabels: Record<(typeof handoverReasons)[number], string> = {
  asked_for_person: 'Asked for a person',
  complaint: 'Complaint',
  refund: 'Refund or exchange',
  discount: 'Discount request',
  angry: 'Upset customer',
  out_of_scope: 'Not in Knowledge',
  ready_to_buy: 'Ready to buy',
  ai_unavailable: 'AI could not answer',
  allowance_used: 'AI replies used up',
  ai_paused: 'AI paused by Dakly',
  store_read_only: 'Plan unpaid',
  other: 'Hand-over rule',
};
