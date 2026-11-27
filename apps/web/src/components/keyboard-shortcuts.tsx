'use client';
import { useEffect, useState } from 'react';

import { Dialog } from '@dakly/ui/dialog';

import {
  findShortcutTarget,
  isTypingTarget,
  shortcutAction,
  shortcutHelp,
} from '@/lib/keyboard-shortcuts';
import { submitFormFromKeyboard } from '@/lib/submit-form';

function formUnderFocus() {
  const active = document.activeElement;
  return active instanceof HTMLElement ? active.closest('form') : null;
}

function leaveTypingField() {
  const active = document.activeElement;
  if (active instanceof HTMLElement && isTypingTarget(active) && !active.closest('dialog'))
    active.blur();
}

function focusSearch(event: KeyboardEvent) {
  const search = findShortcutTarget('input[type="search"]');
  if (!search) return;
  event.preventDefault();
  search.focus();
}

function startNewItem(event: KeyboardEvent) {
  const create = findShortcutTarget('[data-shortcut="new"]');
  if (!create) return;
  event.preventDefault();
  create.click();
}

export function KeyboardShortcuts() {
  const [helpOpen, setHelpOpen] = useState(false);
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      // A screen with its own handler (product editor, new order) already took the key.
      if (event.defaultPrevented || event.isComposing) return;
      const action = shortcutAction(event);
      if (action === 'submit' || action === 'save') {
        if (submitFormFromKeyboard(formUnderFocus())) event.preventDefault();
      } else if (action === 'escape') leaveTypingField();
      else if (action === 'search') focusSearch(event);
      else if (action === 'new') startNewItem(event);
      else if (action === 'help') {
        event.preventDefault();
        setHelpOpen(true);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);
  return (
    <Dialog open={helpOpen} title="Keyboard shortcuts" onClose={() => setHelpOpen(false)}>
      <dl className="space-y-3">
        {shortcutHelp.map((row) => (
          <div key={row.keys} className="flex items-center justify-between gap-4">
            <dt className="text-sm text-text-muted">{row.action}</dt>
            <dd>
              <kbd className="rounded-sm border border-border bg-neutral-soft px-2 py-1 text-xs font-semibold text-text">
                {row.keys}
              </kbd>
            </dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
