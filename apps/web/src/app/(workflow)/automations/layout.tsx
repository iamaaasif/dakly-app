import type { ReactNode } from 'react';

import { StorePage } from '@/components/store-page';
import { requireSession } from '@/lib/require-session';

export default async function AutomationEditorLayout({ children }: { children: ReactNode }) {
  await requireSession();
  return <StorePage permission="canEditAutomations">{children}</StorePage>;
}
