import { useState } from 'react';

import { Button } from '@dakly/ui/button';
import { cn } from '@dakly/ui/cn';

import { NetworkIcon } from './network-icon';
import type { MetaKind } from '@/components/meta-connect/channel-labels';
import { SessionDialog as Dialog } from '@/components/session-dialog';

const choices: { kind: MetaKind; name: string; hint: string }[] = [
  { kind: 'facebook_page', name: 'Facebook Page', hint: 'Post to Pages you manage' },
  {
    kind: 'instagram',
    name: 'Instagram business account',
    hint: 'Business or creator account linked to a Page',
  },
];

type ConnectAccountDialogProps = { onClose: () => void; onContinue: (kind: MetaKind) => void };

export function ConnectAccountDialog({ onClose, onContinue }: ConnectAccountDialogProps) {
  const [kind, setKind] = useState<MetaKind>('facebook_page');
  return (
    <Dialog open title="Connect account" onClose={onClose}>
      <fieldset>
        <legend className="mb-3 text-text-muted">Which account do you want to post to?</legend>
        <div className="space-y-2">
          {choices.map((choice) => (
            <label
              key={choice.kind}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-lg border p-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus',
                kind === choice.kind ? 'border-action bg-primary-soft' : 'border-border',
              )}
            >
              <input
                type="radio"
                name="account-kind"
                className="sr-only"
                checked={kind === choice.kind}
                onChange={() => setKind(choice.kind)}
              />
              <NetworkIcon kind={choice.kind} />
              <span>
                <span className="block font-semibold">{choice.name}</span>
                <span className="block text-sm text-text-muted">{choice.hint}</span>
              </span>
            </label>
          ))}
          <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-muted p-3 text-text-muted">
            <NetworkIcon kind="tiktok" />
            <span className="flex-1">
              <span className="block font-semibold">TikTok</span>
              <span className="block text-sm">Coming soon</span>
            </span>
            <span className="text-sm">Soon</span>
          </div>
        </div>
      </fieldset>
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => onContinue(kind)}>Continue</Button>
      </div>
    </Dialog>
  );
}
