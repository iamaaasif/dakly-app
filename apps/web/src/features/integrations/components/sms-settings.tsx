'use client';
import { Plus } from 'lucide-react';
import { useState } from 'react';

import type { SmsSenderIdResponse } from '@dakly/contracts/sms-senders';
import { Badge } from '@dakly/ui/badge';
import { Button } from '@dakly/ui/button';
import { cn } from '@dakly/ui/cn';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';

import { useSmsSenderIds } from '../api/sms-sender-ids';
import { useSendTestSms } from '../api/sms-sender-requests';
import { RequestSenderDialog } from './request-sender-dialog';
import { useSessionContext } from '@/lib/session-context';

const statusBadge = {
  requested: { label: 'Requested', variant: 'info' },
  in_review: { label: 'In review', variant: 'info' },
  approved: { label: 'Approved', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'danger' },
} as const;

export function SmsSettings() {
  const { data: session } = useSessionContext();
  const editable = Boolean(session?.currentStore?.canEditStoreSettings);
  const [requesting, setRequesting] = useState(false);
  const senders = useSmsSenderIds(50);
  const items = senders.data?.items ?? [];
  const approved = items.find((sender) => sender.status === 'approved');
  const hasActive = items.some((sender) => sender.status !== 'rejected');
  return (
    <section
      aria-labelledby="sender-name-heading"
      className="space-y-4 rounded-lg border border-border bg-surface p-4 md:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-48 flex-1">
          <h2 id="sender-name-heading" className="text-lg font-semibold">
            Sender name
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            What customers see as the sender. A brand name builds trust, but it must be approved by
            the mobile operators first.
          </p>
        </div>
        {editable ? (
          <Button variant="secondary" disabled={hasActive} onClick={() => setRequesting(true)}>
            <Plus aria-hidden="true" size={16} strokeWidth={1.75} />
            Request a sender name
          </Button>
        ) : null}
      </div>
      {senders.isPending ? <Skeleton className="h-16 w-full" /> : null}
      {senders.error ? (
        <QueryError message={senders.error.message} onRetry={() => void senders.refetch()} />
      ) : null}
      {senders.data ? (
        <ul className="space-y-3">
          {items.map((sender) => (
            <SenderRow key={sender.id} sender={sender} editable={editable} />
          ))}
          <SharedSenderRow selected={!approved} />
        </ul>
      ) : null}
      {requesting ? <RequestSenderDialog onClose={() => setRequesting(false)} /> : null}
    </section>
  );
}

function SharedSenderRow({ selected }: { selected: boolean }) {
  return (
    <li
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-md border p-4',
        selected ? 'border-action bg-primary-soft' : 'border-border',
      )}
    >
      <div className="min-w-48 flex-1">
        <p className="font-mono font-semibold">Dakly shared sender</p>
        <p className="text-sm text-text-muted">Number · shared sender, works right away</p>
      </div>
      <Badge variant="success">Approved</Badge>
    </li>
  );
}

function SenderRow({ sender, editable }: { sender: SmsSenderIdResponse; editable: boolean }) {
  const status = statusBadge[sender.status];
  const test = useSendTestSms(sender.id);
  return (
    <li
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-md border p-4',
        sender.status === 'approved' ? 'border-action bg-primary-soft' : 'border-border',
      )}
    >
      <div className="min-w-48 flex-1">
        <p className="font-mono font-semibold">{sender.senderName.toUpperCase()}</p>
        <p className="text-sm text-text-muted">{senderNote(sender)}</p>
        {test.isSuccess ? (
          <p role="status" className="text-sm">
            Test SMS sent to your phone.
          </p>
        ) : null}
        {test.error ? (
          <p role="alert" className="text-sm text-danger">
            {test.error.message}
          </p>
        ) : null}
      </div>
      {sender.status === 'approved' && editable ? (
        <Button variant="secondary" loading={test.isPending} onClick={() => test.mutate()}>
          Send test SMS
        </Button>
      ) : null}
      <Badge variant={status.variant}>{status.label}</Badge>
    </li>
  );
}

function senderNote(sender: SmsSenderIdResponse) {
  if (sender.status === 'approved')
    return `Brand name · customers see ${sender.senderName.toUpperCase()}`;
  if (sender.status === 'rejected')
    return `Not approved${sender.rejectionReason ? `: ${sender.rejectionReason}` : '.'}`;
  return 'Brand name · waiting for the mobile operators, about 7 days. SMS keep going out from the shared sender.';
}
