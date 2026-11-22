import { Clock } from 'lucide-react';

import type { ContactKind } from '@dakly/contracts/contacts';

const statuses: Record<ContactKind, { title: string; text: string }> = {
  chat_only: {
    title: 'Not a lead yet',
    text: 'Dakly saves them as a lead as soon as they share a phone number.',
  },
  lead: { title: 'Lead', text: 'They shared a phone number and have no order yet.' },
  customer: { title: 'Customer', text: 'They have ordered from this shop.' },
  not_customer: { title: 'Not a customer', text: 'Dakly does not send them offers.' },
};

export function CustomerStatus({ kind }: { kind: ContactKind }) {
  const status = statuses[kind];
  return (
    <div className="flex gap-3 rounded-lg bg-surface-muted p-3">
      <Clock aria-hidden="true" size={18} strokeWidth={1.75} className="mt-0.5 shrink-0" />
      <div>
        <p className="font-semibold">{status.title}</p>
        <p className="text-text-muted">{status.text}</p>
      </div>
    </div>
  );
}
