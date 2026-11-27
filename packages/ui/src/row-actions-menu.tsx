'use client';
import { EllipsisVertical } from 'lucide-react';
import type { ReactNode } from 'react';

import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from './dropdown-menu';

export type RowActionsMenuProps = { label: string; children: ReactNode };

// The label names the row ("Actions for Cotton Panjabi") so screen readers can tell the menus apart.
export function RowActionsMenu({ label, children }: RowActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        className="grid size-8 place-items-center rounded-md text-text-secondary hover:bg-neutral-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus data-[state=open]:bg-neutral-soft"
      >
        <EllipsisVertical aria-hidden="true" size={16} />
      </DropdownMenuTrigger>
      <DropdownMenuContent>{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}
