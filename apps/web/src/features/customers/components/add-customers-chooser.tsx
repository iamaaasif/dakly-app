import { ChevronRight, FileUp, PencilLine } from 'lucide-react';
import type { ReactNode } from 'react';

import { SessionDialog as Dialog } from '@/components/session-dialog';

type AddCustomersChooserProps = {
  onChoose: (way: 'manual' | 'import') => void;
  onClose: () => void;
};

export function AddCustomersChooser({ onChoose, onClose }: AddCustomersChooserProps) {
  return (
    <Dialog open title="Add customers" onClose={onClose}>
      <p className="mb-4 text-sm text-text-muted">
        Choose how you want to bring customers into Dakly.
      </p>
      <div className="space-y-3">
        <Way
          icon={<PencilLine aria-hidden="true" size={20} strokeWidth={1.75} />}
          title="Add manually"
          hint="Type one customer's details"
          onClick={() => onChoose('manual')}
        />
        <Way
          icon={<FileUp aria-hidden="true" size={20} strokeWidth={1.75} />}
          title="Import from a CSV file"
          hint="Upload a customer list. We find duplicates for you."
          onClick={() => onChoose('import')}
        />
      </div>
    </Dialog>
  );
}

type WayProps = { icon: ReactNode; title: string; hint: string; onClick: () => void };

function Way({ icon, title, hint, onClick }: WayProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-10 w-full items-center gap-3 rounded-lg border border-border bg-surface p-4 text-left hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-muted text-text">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-text-muted">{hint}</span>
      </span>
      <ChevronRight aria-hidden="true" size={16} strokeWidth={1.75} className="text-text-muted" />
    </button>
  );
}
