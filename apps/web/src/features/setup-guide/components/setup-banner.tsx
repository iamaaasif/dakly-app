'use client';
import { Store } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';

import { useSetupChecklist } from '../api/setup-checklist';
import { HowYouSellDialog } from './how-you-sell-dialog';
import { useSessionContext } from '@/lib/session-context';

// Sign-up asks "How do you sell?" once, so this only shows for a shop with no answers saved.
export function SetupBanner() {
  const { data: session } = useSessionContext();
  const { data } = useSetupChecklist(Boolean(session?.currentStore));
  const [open, setOpen] = useState(false);
  if (!data || data.hidden || data.howYouSell.length > 0) return null;
  if (!session?.currentStore?.canChangeExtensions) return null;

  return (
    <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
      <span
        aria-hidden="true"
        className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary-soft text-action-hover"
      >
        <Store size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-md font-semibold">How do you sell?</h2>
        <p className="text-sm text-text-muted">
          Facebook, a shop, a POS or a notebook — tell us and Dakly sets up the right tools.
        </p>
      </div>
      <Button className="shrink-0" onClick={() => setOpen(true)}>
        Set up Dakly
      </Button>
      <HowYouSellDialog open={open} answers={data.howYouSell} onClose={() => setOpen(false)} />
    </Card>
  );
}
