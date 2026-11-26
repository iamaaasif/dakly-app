import { Check, Clock } from 'lucide-react';
import Link from 'next/link';

import type { ContactKind } from '@dakly/contracts/contacts';

const statuses: Record<ContactKind, { title: string; text: string }> = {
  chat_only: {
    title: 'Not a lead yet',
    text: 'Dakly saves them as a lead as soon as they share a phone number.',
  },
  lead: { title: 'Saved as a lead', text: 'They shared a phone number and have no order yet.' },
  customer: { title: 'Customer', text: 'They have ordered from this shop.' },
  not_customer: { title: 'Not a customer', text: 'Dakly does not send them offers.' },
};

type CustomerStatusProps = {
  kind: ContactKind;
  // Set when the person may open the customer's profile.
  profileHref: string | null;
};

export function CustomerStatus({ kind, profileHref }: CustomerStatusProps) {
  const status = statuses[kind];
  const saved = kind === 'lead';
  return (
    <div
      className={
        saved
          ? 'flex gap-2 rounded-lg bg-success-soft p-3 text-sm'
          : 'flex gap-2 rounded-lg bg-surface-muted p-3 text-sm'
      }
    >
      {saved ? (
        <Check aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-success" />
      ) : (
        <Clock aria-hidden="true" size={16} className="mt-0.5 shrink-0" />
      )}
      <div className="min-w-0">
        <p className={saved ? 'font-semibold text-success' : 'font-semibold'}>{status.title}</p>
        <p>{status.text}</p>
        {profileHref ? (
          <Link href={profileHref} className="font-semibold text-action hover:underline">
            View in Customers
          </Link>
        ) : null}
      </div>
    </div>
  );
}
