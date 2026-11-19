import { notFound } from 'next/navigation';
import { z } from 'zod';

import { StorePage } from '@/components/store-page';
import { WorkflowSettings } from '@/features/automations/components/workflow-settings';
import { requireSession } from '@/lib/require-session';

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  return (
    <StorePage permission="canEditAutomations">
      <WorkflowSettings id={id} />
    </StorePage>
  );
}
