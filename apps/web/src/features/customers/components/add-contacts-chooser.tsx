import { BookOpen, ChevronRight, FileUp, Mic, PencilLine } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { SessionDialog as Dialog } from '@/components/session-dialog';

type AddContactsChooserProps = {
  onChoose: (way: 'manual' | 'import') => void;
  onClose: () => void;
};

const rowClass =
  'flex min-h-10 w-full items-center gap-3 rounded-xl border border-border bg-surface p-4 text-left transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

export function AddContactsChooser({ onChoose, onClose }: AddContactsChooserProps) {
  return (
    <Dialog open title="Add contacts" onClose={onClose}>
      <p className="-mt-3 mb-4 text-sm text-text-muted">
        Choose how you want to bring contacts into Dakly.
      </p>
      <div className="space-y-3">
        <Way
          icon={<PencilLine aria-hidden="true" size={20} strokeWidth={1.75} />}
          tint="bg-surface-muted text-text"
          title="Add manually"
          hint="Type one contact's details"
          onClick={() => onChoose('manual')}
        />
        <div aria-disabled="true" className={`${rowClass} cursor-not-allowed opacity-70`}>
          <Icon tint="bg-primary-soft text-action">
            <Mic aria-hidden="true" size={20} strokeWidth={1.75} />
          </Icon>
          <Copy title="Add by voice" hint="Say the details in Bangla, English or both" />
          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-text-muted">
            Coming soon
          </span>
        </div>
        <Way
          icon={<FileUp aria-hidden="true" size={20} strokeWidth={1.75} />}
          tint="bg-info-soft text-info"
          title="Import from Excel or CSV"
          hint="Upload a contact list. We find duplicates for you."
          onClick={() => onChoose('import')}
        />
        <Link href="/customers/khata-scan" className={rowClass}>
          <Icon tint="bg-surface-muted text-text">
            <BookOpen aria-hidden="true" size={20} strokeWidth={1.75} />
          </Icon>
          <Copy
            title="Scan your khata"
            hint="Photograph your sales notebook. Dakly reads names, phones and sales."
          />
          <Chevron />
        </Link>
      </div>
    </Dialog>
  );
}

type WayProps = { icon: ReactNode; tint: string; title: string; hint: string; onClick: () => void };

function Way({ icon, tint, title, hint, onClick }: WayProps) {
  return (
    <button type="button" onClick={onClick} className={rowClass}>
      <Icon tint={tint}>{icon}</Icon>
      <Copy title={title} hint={hint} />
      <Chevron />
    </button>
  );
}

function Icon({ tint, children }: { tint: string; children: ReactNode }) {
  return (
    <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${tint}`}>
      {children}
    </span>
  );
}

function Copy({ title, hint }: { title: string; hint: string }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block font-semibold">{title}</span>
      <span className="block text-sm text-text-muted">{hint}</span>
    </span>
  );
}

function Chevron() {
  return (
    <ChevronRight aria-hidden="true" size={16} strokeWidth={1.75} className="text-text-muted" />
  );
}
