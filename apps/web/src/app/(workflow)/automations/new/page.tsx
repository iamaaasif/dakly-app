import { StorePage } from '@/components/store-page';
import { WorkflowLibrary } from '@/features/automations/components/workflow-library';
import { requireSession } from '@/lib/require-session';

export default async function NewAutomationPage() {
  await requireSession();
  return (
    <StorePage permission="canEditAutomations">
      <WorkflowLibrary />
    </StorePage>
  );
}
