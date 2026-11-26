import { Clock, UserCheck } from 'lucide-react';

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

export function CustomerStatus({ kind }: { kind: ContactKind }) {
  const status = statuses[kind];
  const saved = kind === 'lead';
  return (
    <div
      className={
        saved
          ? 'flex gap-2 rounded-md bg-success-soft p-3 text-success'
          : 'flex gap-2 rounded-md bg-surface-muted p-3'
      }
    >
      {saved ? (
        <UserCheck aria-hidden="true" size={16} />
      ) : (
        <Clock aria-hidden="true" size={16} className="shrink-0" />
      )}
      <div>
        <p className="font-semibold">{status.title}</p>
        <p className="text-sm">{status.text}</p>
      </div>
    </div>
  );
}
