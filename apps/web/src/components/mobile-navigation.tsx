'use client';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { Menu, X } from 'lucide-react';
import type { SessionContext } from '@dakly/contracts/sessions';
import { Button } from '@dakly/ui/button';
import { ShellNavigation } from './shell-navigation';

export function MobileNavigation({ session }: { session: SessionContext }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 768px)');
    const close = () => {
      if (desktop.matches) dialog.current?.close();
    };
    desktop.addEventListener('change', close);
    return () => desktop.removeEventListener('change', close);
  }, []);
  return (
    <>
      <Button
        ref={trigger}
        variant="secondary"
        className="shrink-0 px-2 md:hidden"
        aria-label="Open navigation"
        onClick={() => dialog.current?.showModal()}
      >
        <Menu aria-hidden="true" size={20} />
      </Button>
      <dialog
        ref={dialog}
        onKeyDown={trapNavigationFocus}
        aria-labelledby="navigation-title"
        onClose={() => trigger.current?.focus()}
        className="fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-62 max-w-full border-r border-border bg-surface text-text backdrop:bg-inverse/50"
      >
        <div className="flex items-center justify-between p-3">
          <h2 id="navigation-title" className="font-semibold">
            Navigation
          </h2>
          <Button
            variant="secondary"
            className="px-2"
            aria-label="Close navigation"
            onClick={() => dialog.current?.close()}
          >
            <X aria-hidden="true" size={20} />
          </Button>
        </div>
        <ShellNavigation session={session} onNavigate={() => dialog.current?.close()} />
      </dialog>
    </>
  );
}

function trapNavigationFocus(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== 'Tab') return;
  const elements = event.currentTarget.querySelectorAll<HTMLElement>(
    'button:not(:disabled), a[href]',
  );
  const first = elements[0],
    last = elements[elements.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  }
  if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}
