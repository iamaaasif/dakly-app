import { Music2 } from 'lucide-react';
import { useFormContext } from 'react-hook-form';

import { postKinds, type CreatePostInput } from '@dakly/contracts/social';
import { Checkbox } from '@dakly/ui/checkbox';
import { cn } from '@dakly/ui/cn';

import type { SocialAccount } from '../../api/get-social-accounts';
import { networkNames } from '../../social-labels';
import { NetworkIcon } from '../network-icon';

const postTypes = {
  post: { title: 'Post', hint: 'Photos with a caption in the feed' },
  story: { title: 'Story', hint: 'One full-screen photo for 24 hours' },
} as const;

const cardClass =
  'flex min-h-14 min-w-0 items-center gap-3 rounded-lg border p-3 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus';

export function PostDestinations({ accounts }: { accounts: SocialAccount[] }) {
  return (
    <section
      aria-labelledby="post-to"
      className="space-y-4 rounded-lg border border-border bg-surface p-4"
    >
      <div className="space-y-2">
        <h2 id="post-to" className="text-sm font-semibold">
          Post to
        </h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {accounts.map((account) => (
            <li key={account.id}>
              <AccountChoice account={account} />
            </li>
          ))}
          <li>
            <TikTokCard />
          </li>
        </ul>
      </div>
      <PostTypeChoice />
    </section>
  );
}

function AccountChoice({ account }: { account: SocialAccount }) {
  const { watch, setValue } = useFormContext<CreatePostInput>();
  const targets = watch('targets');
  const checked = targets.some(({ channelConnectionId }) => channelConnectionId === account.id);
  const expired = account.status === 'needs_reconnect';
  const toggle = (on: boolean) =>
    setValue(
      'targets',
      on
        ? [...targets, { channelConnectionId: account.id, captionOverride: null }]
        : targets.filter(({ channelConnectionId }) => channelConnectionId !== account.id),
      { shouldDirty: true },
    );
  return (
    <label
      className={cn(
        cardClass,
        expired ? 'cursor-default opacity-70' : 'cursor-pointer',
        checked ? 'border-primary bg-primary-soft' : 'border-border-strong',
      )}
    >
      <Checkbox
        checked={checked}
        disabled={expired}
        onCheckedChange={(value) => toggle(value === true)}
        aria-label={`Post to ${account.displayName}`}
      />
      <NetworkIcon kind={account.kind} size="small" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{account.displayName}</span>
        <span className={cn('block text-xs', expired ? 'text-danger' : 'text-text-muted')}>
          {expired ? 'Access expired' : networkNames[account.kind]}
        </span>
      </span>
    </label>
  );
}

function TikTokCard() {
  return (
    <div
      className={cn(cardClass, 'border-dashed border-border-strong bg-surface-muted opacity-70')}
    >
      <span aria-hidden="true" className="size-5 shrink-0 rounded-sm border border-border-strong" />
      <Music2
        aria-hidden="true"
        size={20}
        strokeWidth={1.75}
        className="shrink-0 text-text-muted"
      />
      <span>
        <span className="block text-sm font-semibold text-text-muted">TikTok</span>
        <span className="block text-xs text-text-muted">Coming soon</span>
      </span>
    </div>
  );
}

function PostTypeChoice() {
  const { watch, setValue } = useFormContext<CreatePostInput>();
  const kind = watch('kind');
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">Post type</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {postKinds.map((value) => (
          <label
            key={value}
            className={cn(
              cardClass,
              'cursor-pointer',
              kind === value ? 'border-primary bg-primary-soft' : 'border-border-strong',
            )}
          >
            <input
              type="radio"
              name="kind"
              value={value}
              checked={kind === value}
              onChange={() => setValue('kind', value, { shouldDirty: true })}
              className="size-4 accent-action"
            />
            <span>
              <span className="block text-sm font-semibold">{postTypes[value].title}</span>
              <span className="block text-xs text-text-muted">{postTypes[value].hint}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
