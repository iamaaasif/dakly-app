import { MessageSquare, Smartphone } from 'lucide-react';

import type { SmsSenderIdResponse } from '@dakly/contracts/sms-senders';
import { Badge } from '@dakly/ui/badge';

const senderStatus = {
  requested: { label: 'Requested', variant: 'info' },
  in_review: { label: 'In review', variant: 'info' },
  approved: { label: 'Approved', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'danger' },
} as const;

function CardFrame({
  name,
  badge,
  icon,
  children,
}: {
  name: string;
  badge: React.ReactNode;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={name}
      className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-surface p-4 md:p-6"
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-md bg-primary-soft text-action">
        {icon}
      </span>
      <div className="min-w-48 flex-1">
        <h3 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
          {name}
          {badge}
        </h3>
        {children}
      </div>
    </section>
  );
}

// Connecting WhatsApp waits on CHN-3, which needs Meta's business verification.
export function WhatsAppCard() {
  return (
    <CardFrame
      name="WhatsApp"
      icon={<MessageSquare aria-hidden="true" size={24} strokeWidth={1.75} />}
      badge={<Badge variant="neutral">Waiting for setup</Badge>}
    >
      <p className="text-sm text-text-muted">
        WhatsApp opens once Meta has verified Dakly’s business. We will tell you when you can
        connect.
      </p>
    </CardFrame>
  );
}

// Requesting a sender name and the upload screens wait on CHN-7.
export function SmsSenderCard({ sender }: { sender: SmsSenderIdResponse | undefined }) {
  const status = sender ? senderStatus[sender.status] : null;
  return (
    <CardFrame
      name="SMS sender"
      icon={<Smartphone aria-hidden="true" size={24} strokeWidth={1.75} />}
      badge={status ? <Badge variant={status.variant}>{status.label}</Badge> : null}
    >
      <p className="text-sm text-text-muted">{senderNote(sender)}</p>
    </CardFrame>
  );
}

function senderNote(sender: SmsSenderIdResponse | undefined) {
  const shared = 'Your SMS go out from Dakly’s shared sender.';
  if (!sender) return shared;
  if (sender.status === 'approved') return `Your SMS go out as ${sender.senderName}.`;
  if (sender.status === 'rejected')
    return `${sender.senderName} was not approved${sender.rejectionReason ? `: ${sender.rejectionReason}` : '.'} ${shared}`;
  return `${sender.senderName} is waiting for approval. Until then your SMS go out from Dakly’s shared sender.`;
}
