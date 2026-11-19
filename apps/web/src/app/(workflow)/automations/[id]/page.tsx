import { notFound } from 'next/navigation';
import { z } from 'zod';

import { WorkflowSettings } from '@/features/automations/components/workflow-settings';

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  return <WorkflowSettings id={id} />;
}
