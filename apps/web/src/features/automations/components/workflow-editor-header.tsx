import Link from 'next/link';
import { type ReactNode, useState } from 'react';

import { AUTOMATION_NAME_MAX } from '@dakly/contracts/automations';
import { Button } from '@dakly/ui/button';
import { Input } from '@dakly/ui/input';

type Props = {
  name: string;
  badge: ReactNode;
  onRename: (name: string) => Promise<boolean>;
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

export function WorkflowEditorHeader({ name, badge, onRename, children }: Props) {
  const [renaming, setRenaming] = useState(false);
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href="/automations"
          aria-label="Back to Automations"
          className="grid size-9 shrink-0 place-items-center rounded-md bg-primary text-md font-bold text-on-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          D
        </Link>
        {renaming ? (
          <RenameForm name={name} onRename={onRename} onDone={() => setRenaming(false)} />
        ) : (
          <>
            <h1 className="min-w-0 truncate font-bold" title={name}>
              {name}
            </h1>
            <button
              type="button"
              onClick={() => setRenaming(true)}
              className="font-semibold text-action-hover focus-visible:outline-2 focus-visible:outline-focus"
            >
              Edit<span className="sr-only"> name</span>
            </button>
          </>
        )}
        {badge}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </header>
  );
}
