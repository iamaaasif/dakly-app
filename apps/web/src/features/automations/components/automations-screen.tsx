'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { Button } from '@dakly/ui/button';
import { Skeleton } from '@dakly/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@dakly/ui/tabs';

import { useAutomations } from '../api/automations';
import { AutomationRow } from './automation-row';
import { useSessionContext } from '@/lib/session-context';

const tabs = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'paused', label: 'Disabled' },
  { key: 'draft', label: 'Draft' },
] as const;

export function AutomationsScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selected = tabs.find(({ key }) => key === params.get('tab'))?.key ?? 'all';
  const { data } = useSessionContext();
  const canEdit = data?.currentStore?.canEditAutomations === true;
  const workflows = useAutomations();
  const items = workflows.data?.items ?? [];
  const selectedItems = items.filter(({ status }) => selected === 'all' || status === selected);
  return (
    <main className="space-y-6 p-4 md:p-8">
      <WorkflowHeader canEdit={canEdit} />
      <Tabs
        value={selected}
        activationMode="manual"
        onValueChange={(tab) =>
          router.push(tab === 'all' ? pathname : `${pathname}?tab=${tab}`, { scroll: false })
        }
        className="rounded-lg border border-border bg-surface"
      >
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <h2 className="font-semibold">Your workflows</h2>
          <TabsList
            aria-label="Workflow status"
            className="max-w-full rounded-md border-0 bg-surface-muted p-0.5"
          >
            {tabs.map(({ key, label }) => (
              <TabsTrigger
                key={key}
                value={key}
                className="m-0 rounded-md border-0 px-2 text-sm data-[state=active]:bg-surface"
              >
                {label}
                {workflows.data && (
                  <span className="ml-1 tabular-nums">
                    {items.filter(({ status }) => key === 'all' || status === key).length}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </header>
        <TabsContent value={selected} className="pt-0">
          <WorkflowList workflows={workflows} items={selectedItems} canEdit={canEdit} />
        </TabsContent>
      </Tabs>
    </main>
  );
}

function WorkflowHeader({ canEdit }: { canEdit: boolean }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 flex-1 basis-2/3">
        <h1 className="text-xl font-bold">Automations</h1>
        <p className="mt-1 text-sm text-text-muted">
          Workflows send messages on their own when customers do something, like placing an order.
          Messages only go to customers who agreed to hear from you.
        </p>
      </div>
      {canEdit && (
        <Link
          href="/automations/new"
          className="inline-flex min-h-10 items-center gap-2 rounded-md bg-action px-4 py-2 font-medium text-on-primary hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <Plus size={16} aria-hidden="true" /> Create workflow
        </Link>
      )}
    </header>
  );
}

function WorkflowList({
  workflows,
  items,
  canEdit,
}: {
  workflows: ReturnType<typeof useAutomations>;
  items: NonNullable<ReturnType<typeof useAutomations>['data']>['items'];
  canEdit: boolean;
}) {
  if (workflows.isPending)
    return (
      <div role="status" className="p-4">
        <span className="sr-only">Loading workflows</span>
        <Skeleton className="h-28 w-full" />
      </div>
    );
  if (workflows.isError)
    return (
      <div role="alert" className="space-y-2 p-4">
        <p>{workflows.error.message}</p>
        <Button variant="secondary" onClick={() => void workflows.refetch()}>
          Try again
        </Button>
      </div>
    );
  if (!items.length) return <p className="p-4 text-text-muted">No workflows in this tab.</p>;
  return (
    <ul className="divide-y divide-border">
      {items.map((workflow) => (
        <AutomationRow key={workflow.id} workflow={workflow} canEdit={canEdit} />
      ))}
    </ul>
  );
}
