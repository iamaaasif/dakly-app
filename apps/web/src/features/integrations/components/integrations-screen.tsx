'use client';
import { useState } from 'react';

import { QueryError } from '@dakly/ui/query-error';

import { useChannelConnections } from '../api/channel-connections';
import { useSmsSenderIds } from '../api/sms-sender-ids';
import { ChannelCard } from './channel-card';
import { IntegrationsLoading } from './integrations-loading';
import { SmsSenderCard, WhatsAppCard } from './waiting-cards';
import { useSessionContext } from '@/lib/session-context';

export function IntegrationsScreen() {
  const { data: session } = useSessionContext();
  const connections = useChannelConnections();
  const senders = useSmsSenderIds();
  const [notice, setNotice] = useState<string | null>(null);
  const failed = connections.error ?? senders.error;
  if (failed)
    return (
      <main className="p-4 md:p-8">
        <QueryError
          message={failed.message}
          onRetry={() => void Promise.all([connections.refetch(), senders.refetch()])}
          retryLabel="Retry integrations"
        />
      </main>
    );
  if (!connections.data || !senders.data) return <IntegrationsLoading />;
  const items = connections.data.items;
  const connected = items.filter(({ status }) => status !== 'disconnected').length;
  const canEdit = Boolean(session?.currentStore?.canEditStoreSettings);
  return (
    <main className="space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-xl font-bold md:text-2xl">Integrations</h1>
        <p className="mt-1 text-sm text-text-muted">
          Connect your Facebook Page and Instagram so customer messages come into Dakly on their
          own.
        </p>
      </div>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold">Messaging and social</h2>
        <p className="text-sm text-text-muted">{connected} connected</p>
      </div>
      {notice ? (
        <p role="status" className="rounded-md bg-success-soft p-3 text-sm text-success">
          {notice}
        </p>
      ) : null}
      <div className="space-y-4">
        <ChannelCard
          kind="facebook_page"
          connections={items}
          canEdit={canEdit}
          onNotice={setNotice}
        />
        <ChannelCard kind="instagram" connections={items} canEdit={canEdit} onNotice={setNotice} />
        <WhatsAppCard />
        <SmsSenderCard sender={senders.data.items[0]} />
      </div>
    </main>
  );
}
