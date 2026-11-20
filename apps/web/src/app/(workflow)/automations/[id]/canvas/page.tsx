import { notFound } from 'next/navigation';
import { z } from 'zod';

import { StorePage } from '@/components/store-page';
import { WorkflowCanvas } from '@/features/automations/components/workflow-canvas';
import { requireSession } from '@/lib/require-session';

export default async function CanvasPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  return (
    <StorePage permission="canViewAutomations">
      <WorkflowCanvas id={id} />
    </StorePage>
  );
}
