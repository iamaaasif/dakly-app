'use client';
import Link from 'next/link';

import type { SessionContext } from '@dakly/contracts/sessions';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@dakly/ui/dropdown-menu';

import { initialsOf } from '@/lib/initials';

type AccountMenuProps = { user: SessionContext['user']; onSignOut: () => Promise<void> };
export function AccountMenu({ user, onSignOut }: AccountMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        {initialsOf(user.name)}
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <p className="max-w-56 truncate px-3 py-2 text-sm text-text-muted">{user.name}</p>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/security?tab=profile">Profile</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/security?tab=two-step">Security</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void onSignOut()}>Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
