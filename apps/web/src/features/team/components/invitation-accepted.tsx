import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { SessionContext } from '@dakly/contracts/sessions';
import { Button } from '@dakly/ui/button';

import { apiPost, apiRequest } from '@/lib/api-client';
import { notifySessionChange } from '@/lib/notify-session-change';
import { sessionContextKey } from '@/lib/session-context';

export function InvitationAccepted({ storeId }: { storeId: string }) {
  const client = useQueryClient();
  const choose = useMutation({
    mutationFn: async () => {
      const context = await apiRequest<SessionContext>('/me/context');
      await apiPost('/me/active-store', { storeId }, { contextTag: context.contextTag });
      client.removeQueries({ queryKey: sessionContextKey });
      notifySessionChange();
      window.location.replace('/dashboard');
    },
  });
  return (
    <section className="space-y-4">
      <p role="status">Invitation accepted.</p>
      <Button loading={choose.isPending} onClick={() => choose.mutate()}>
        Open joined shop
      </Button>
      {choose.error ? <p role="alert">{choose.error.message}</p> : null}
    </section>
  );
}
