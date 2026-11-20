import { Globe, MessageCircle, MoreVertical, Share2, ThumbsUp } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';

import { cn } from '@dakly/ui/cn';

import { networkNames } from '../../social-labels';
import { NetworkIcon } from '../network-icon';
import { initialsOf } from '@/lib/initials';

export type PreviewNetwork = 'facebook_page' | 'instagram';

type PostPreviewProps = {
  networks: PreviewNetwork[];
  accountName: (network: PreviewNetwork) => string;
  caption: (network: PreviewNetwork) => string;
  photos: { id: string; url: string }[];
  whenLabel: string;
};

const tabs: PreviewNetwork[] = ['facebook_page', 'instagram'];

export function PostPreview({
  networks,
  accountName,
  caption,
  photos,
  whenLabel,
}: PostPreviewProps) {
  const [picked, setPicked] = useState<PreviewNetwork>('facebook_page');
  const shown = networks.includes(picked) ? picked : (networks[0] ?? 'facebook_page');
  return (
    <aside aria-label="Preview" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-medium tracking-wide text-text-muted uppercase">Preview</h2>
        <div
          role="group"
          aria-label="Preview network"
          className="flex rounded-lg bg-surface-muted p-1"
        >
          {tabs.map((network) => (
            <button
              key={network}
              type="button"
              aria-pressed={shown === network}
              onClick={() => setPicked(network)}
              className={cn(
                'flex min-h-8 items-center gap-1.5 rounded-md px-3 text-sm focus-visible:outline-2 focus-visible:outline-focus',
                shown === network ? 'shadow-sm bg-surface font-medium' : 'text-text-muted',
              )}
            >
              <NetworkIcon kind={network} size="small" /> {networkNames[network]}
            </button>
          ))}
        </div>
      </div>
      <PreviewCard
        network={shown}
        name={accountName(shown)}
        text={caption(shown)}
        photo={photos[0]}
        whenLabel={whenLabel}
      />
      <p className="text-center text-xs text-text-muted">
        {networkNames[shown]} feed preview. Final layout can vary slightly by device.
      </p>
    </aside>
  );
}

type PreviewCardProps = {
  network: PreviewNetwork;
  name: string;
  text: string;
  photo: { url: string } | undefined;
  whenLabel: string;
};

function PreviewCard({ network, name, text, photo, whenLabel }: PreviewCardProps) {
  return (
    <article className="rounded-xl shadow-sm overflow-hidden border border-border bg-surface">
      <header className="flex items-center gap-3 p-3">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-on-primary"
        >
          {initialsOf(name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="flex items-center gap-1 text-xs text-text-muted">
            {whenLabel}{' '}
            {network === 'facebook_page' && (
              <Globe aria-hidden="true" size={12} strokeWidth={1.75} />
            )}
          </p>
        </div>
        <MoreVertical aria-hidden="true" size={16} className="text-text-subtle" />
      </header>
      {text && <p className="px-3 pb-3 text-sm wrap-anywhere whitespace-pre-wrap">{text}</p>}
      {photo && (
        <Image
          src={photo.url}
          alt=""
          width={480}
          height={480}
          unoptimized
          className="aspect-square w-full object-cover"
        />
      )}
      <footer className="mx-3 flex justify-around border-t border-border py-2 text-sm text-text-muted">
        <span className="flex items-center gap-1.5">
          <ThumbsUp aria-hidden="true" size={16} strokeWidth={1.75} /> Like
        </span>
        <span className="flex items-center gap-1.5">
          <MessageCircle aria-hidden="true" size={16} strokeWidth={1.75} /> Comment
        </span>
        <span className="flex items-center gap-1.5">
          <Share2 aria-hidden="true" size={16} strokeWidth={1.75} /> Share
        </span>
      </footer>
    </article>
  );
}
