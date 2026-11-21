import type { KhataRowResponse } from '@dakly/contracts/khata-scans';

import { useSuggestedCustomer } from '../api/suggested-customer';
import type { RowChoice } from '../khata-review';
import { formatPhone } from '@/lib/format-phone';

type SuggestedCustomerProps = {
  match: NonNullable<KhataRowResponse['match']>;
  choice: RowChoice;
  onLink: (link: RowChoice['link']) => void;
};

// A similar phone is only offered. The owner links it or says no (SHOP-R7); nothing merges itself.
export function SuggestedCustomer({ match, choice, onLink }: SuggestedCustomerProps) {
  const customer = useSuggestedCustomer(match.contactId);
  if (!customer.data) return null;
  const who = [
    customer.data.name ?? 'customer',
    customer.data.phone && formatPhone(customer.data.phone),
  ]
    .filter(Boolean)
    .join(' ');
  if (match.kind === 'phone')
    return <span className="text-text-muted">Existing customer: {who}</span>;
  if (choice.link === 'yes')
    return <span className="font-semibold text-info">Linked to {who}</span>;
  if (choice.link === 'no') return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-info-soft py-0.5 pr-1 pl-2.5 text-info">
      Merge with {who}?
      <button
        type="button"
        onClick={() => onLink('yes')}
        className="min-h-6 rounded-full bg-info px-2 text-xs font-semibold text-on-primary"
      >
        Yes, link
      </button>
      <button
        type="button"
        onClick={() => onLink('no')}
        className="min-h-6 rounded-full px-2 text-xs font-semibold"
      >
        No
      </button>
    </span>
  );
}
