'use client';
import { Sparkles } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@dakly/ui/button';

import { useAskPanel } from '../hooks/use-ask-panel';
import { AskDaklyPanel, type Turn } from './ask-dakly-panel';
import { useSessionContext } from '@/lib/session-context';

export function AskDaklyButton() {
  const { data } = useSessionContext();
  return data?.currentStore ? <StoreAskDaklyButton /> : null;
}

function StoreAskDaklyButton() {
  const [isOpen, setOpen] = useAskPanel();
  // Kept here, so closing the panel does not lose the conversation.
  const [turns, setTurns] = useState<Turn[]>([]);
  return (
    <>
      <Button
        className="shrink-0 bg-inverse px-3 text-on-primary hover:bg-inverse/85"
        aria-expanded={isOpen}
        onClick={() => setOpen(true)}
      >
        <Sparkles aria-hidden="true" size={16} />
        <span className="max-sm:sr-only">Ask Dakly AI</span>
      </Button>
      {isOpen ? (
        <AskDaklyPanel turns={turns} onTurns={setTurns} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}
