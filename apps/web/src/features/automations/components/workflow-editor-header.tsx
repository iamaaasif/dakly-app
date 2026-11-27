import { LogOut, Pencil } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useState } from 'react';

import { AUTOMATION_NAME_MAX } from '@dakly/contracts/automations';
import { Button } from '@dakly/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@dakly/ui/dropdown-menu';
import { Input } from '@dakly/ui/input';

type Props = {
  name: string;
  badge: ReactNode;
  onRename: (name: string) => Promise<boolean>;
  onOpenSettings: () => void;
  children: ReactNode;
};

function RenameForm({
  name,
  onRename,
  onDone,
}: Pick<Props, 'name' | 'onRename'> & { onDone: () => void }) {
  const [value, setValue] = useState(name);
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const next = value.trim();
        if (next === name || (next && (await onRename(next)))) onDone();
      }}
      onKeyDown={(event) => event.key === 'Escape' && onDone()}
    >
      <Input
        autoFocus
        aria-label="Workflow name"
        value={value}
        maxLength={AUTOMATION_NAME_MAX}
        className="min-h-9 w-56"
        onChange={(event) => setValue(event.target.value)}
      />
      <Button type="submit" variant="secondary">
        Save name
      </Button>
    </form>
  );
}

export function WorkflowEditorHeader({ name, badge, onRename, onOpenSettings, children }: Props) {
  const [renaming, setRenaming] = useState(false);
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border bg-surface px-4 py-3 md:h-15 md:flex-nowrap md:py-0">
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden="true"
          className="size-8 shrink-0 rounded-lg bg-linear-to-br from-primary to-action shadow-card"
        />
        <Link
          href="/automations"
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-md border-l border-border pr-2 pl-3 text-sm font-medium text-text-secondary transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <LogOut size={16} aria-hidden="true" className="rotate-180" />
          Exit<span className="sr-only"> to Automations</span>
        </Link>
        {renaming ? (
          <RenameForm name={name} onRename={onRename} onDone={() => setRenaming(false)} />
        ) : (
          <>
            <h1 className="min-w-0 truncate text-md font-semibold" title={name}>
              {name}
            </h1>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Workflow options"
                className="grid size-7 shrink-0 place-items-center rounded-md text-text-muted transition-colors hover:bg-surface-muted hover:text-text focus-visible:outline-2 focus-visible:outline-focus"
              >
                <Pencil size={14} aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onSelect={() => setRenaming(true)}>
                  Rename workflow
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onOpenSettings}>Workflow settings</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
        {badge}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </header>
  );
}
