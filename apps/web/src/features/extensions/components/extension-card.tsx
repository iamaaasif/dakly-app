import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@dakly/ui/badge';
import { Card } from '@dakly/ui/card';
import { Switch } from '@dakly/ui/switch';

import type { ExtensionCard as ExtensionCardData } from './extension-catalog';

export function ExtensionCard({
  card,
  on,
  canChange,
  saving,
  onToggle,
}: {
  card: ExtensionCardData;
  on: boolean;
  canChange: boolean;
  saving: boolean;
  onToggle: (on: boolean) => void;
}) {
  const Icon = card.icon;
  const titleId = `extension-${card.name}`;
  return (
    <Card className="flex flex-col gap-4 p-5" aria-labelledby={titleId} role="group">
      <div className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary"
        >
          <Icon size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={titleId} className="text-md font-semibold">
              {card.title}
            </h2>
            <StatusBadge comingSoon={card.comingSoon} on={on} />
          </div>
          <p className="mt-1 text-sm text-text-muted">{card.description}</p>
        </div>
        <Switch
          checked={on}
          disabled={card.comingSoon || !canChange || saving}
          onCheckedChange={onToggle}
          id={`${titleId}-switch`}
          aria-labelledby={titleId}
        />
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-sm text-text-muted">Adds: {card.adds}</p>
        {card.comingSoon ? null : <OpenLink href={card.href} enabled={on} />}
      </div>
    </Card>
  );
}

function StatusBadge({ comingSoon, on }: { comingSoon?: boolean; on: boolean }) {
  if (comingSoon) return <Badge>Coming soon</Badge>;
  return on ? <Badge variant="success">On</Badge> : <Badge>Off</Badge>;
}

function OpenLink({ href, enabled }: { href: string; enabled: boolean }) {
  return (
    <Link
      href={href}
      aria-disabled={!enabled}
      tabIndex={enabled ? undefined : -1}
      className="inline-flex min-h-10 items-center gap-1 rounded-md border border-input-border px-4 text-sm font-semibold hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-disabled:pointer-events-none aria-disabled:opacity-50"
    >
      Open
      <ChevronRight size={16} aria-hidden="true" />
    </Link>
  );
}
