import { Image as ImageIcon } from 'lucide-react';
import Image from 'next/image';

import { formatCount } from '@dakly/contracts/money';

import type { SocialAccount } from '../api/get-social-accounts';
import { publishedTotals, type CalendarEntry } from '../post-calendar';
import { networkNames } from '../social-labels';
import { NetworkIcon } from './network-icon';
import { postTitle } from './post-chip';
import { ViewPostLink } from './view-post-link';
import { formatShortDateTime } from '@/lib/format-date';

type PublishedRowProps = {
  entry: CalendarEntry;
  accounts: SocialAccount[];
  onOpen: (entry: CalendarEntry) => void;
};

export function PublishedRow({ entry, accounts, onOpen }: PublishedRowProps) {
  const totals = publishedTotals(entry.post);
  const photo = entry.post.photos[0];
  const stats = [
    ['Reach', totals.reach],
    ['Reactions', totals.reactions],
    ['Comments', totals.comments],
    ['Link taps', totals.linkTaps],
  ] as const;
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <PublishedThumbnail photo={photo} />
      <div className="min-w-48 flex-1 space-y-1">
        <button
          type="button"
          onClick={() => onOpen(entry)}
          className="text-left font-semibold break-words hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {postTitle(entry)}
        </button>
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-text-muted">
          <span className="flex gap-1">
            {entry.kinds.map((kind) => (
              <NetworkIcon key={kind} kind={kind} size="small" />
            ))}
          </span>
          {entry.kinds.map((kind) => networkNames[kind]).join(' + ')} · Published{' '}
          {formatShortDateTime(entry.at)}
        </p>
        <p className="flex flex-wrap gap-x-4">
          {entry.post.targets.map((target) => (
            <ViewPostLink
              key={target.id}
              permalink={target.permalink}
              kind={accounts.find(({ id }) => id === target.channelConnectionId)?.kind}
            />
          ))}
        </p>
      </div>
      <dl className="grid grid-cols-4 gap-4 text-center">
        {stats.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-text-muted">{label}</dt>
            <dd className="font-semibold">{value === null ? '—' : formatCount(value)}</dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

function PublishedThumbnail({
  photo,
}: {
  photo: CalendarEntry['post']['photos'][number] | undefined;
}) {
  return photo ? (
    <Image
      src={photo.url}
      alt=""
      width={64}
      height={64}
      unoptimized
      className="size-16 shrink-0 rounded-md object-cover"
    />
  ) : (
    <span
      aria-hidden="true"
      className="grid size-16 shrink-0 place-items-center rounded-md bg-surface-muted text-text-subtle"
    >
      <ImageIcon size={20} strokeWidth={1.75} />
    </span>
  );
}
