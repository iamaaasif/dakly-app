import { useFormContext } from 'react-hook-form';

import type { CreatePostInput } from '@dakly/contracts/social';
import { Checkbox } from '@dakly/ui/checkbox';
import { Label } from '@dakly/ui/label';
import { Textarea } from '@dakly/ui/textarea';

import type { SocialAccount } from '../../api/get-social-accounts';
import { networkNames } from '../../social-labels';

export function CaptionField({ accounts }: { accounts: SocialAccount[] }) {
  const { watch, setValue } = useFormContext<CreatePostInput>();
  const caption = watch('caption') ?? '';
  const targets = watch('targets');
  const customised = targets.some(({ captionOverride }) => captionOverride !== null);
  const setCustomised = (on: boolean) =>
    setValue(
      'targets',
      targets.map((target) => ({ ...target, captionOverride: on ? caption : null })),
      { shouldDirty: true },
    );
  return (
    <section
      aria-labelledby="caption-heading"
      className="space-y-3 rounded-lg border border-border bg-surface p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="caption-heading" className="text-sm font-semibold">
          Caption
        </h2>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={customised}
            disabled={targets.length < 2}
            onCheckedChange={(value) => setCustomised(value === true)}
          />
          Customize for each network
        </label>
      </div>
      {customised ? (
        <NetworkCaptions accounts={accounts} />
      ) : (
        <Textarea
          aria-label="Caption"
          className="min-h-48"
          placeholder="Write a caption"
          value={caption}
          onChange={(event) => setValue('caption', event.target.value, { shouldDirty: true })}
        />
      )}
    </section>
  );
}

function NetworkCaptions({ accounts }: { accounts: SocialAccount[] }) {
  const { watch, setValue } = useFormContext<CreatePostInput>();
  const targets = watch('targets');
  return targets.map((target) => {
    const account = accounts.find(({ id }) => id === target.channelConnectionId);
    if (!account) return null;
    return (
      <div key={account.id} className="space-y-1.5">
        <Label htmlFor={`caption-${account.id}`}>
          {networkNames[account.kind]}: {account.displayName}
        </Label>
        <Textarea
          id={`caption-${account.id}`}
          className="min-h-32"
          value={target.captionOverride ?? ''}
          onChange={(event) =>
            setValue(
              'targets',
              targets.map((item) =>
                item === target ? { ...item, captionOverride: event.target.value } : item,
              ),
              { shouldDirty: true },
            )
          }
        />
      </div>
    );
  });
}
