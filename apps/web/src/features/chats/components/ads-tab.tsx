import Image from 'next/image';
import { useState } from 'react';

import type { AdListItem } from '@dakly/contracts/ad-links';
import { Badge } from '@dakly/ui/badge';
import { Button } from '@dakly/ui/button';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';
import { useToast } from '@dakly/ui/toast';

import { useAds, useConfirmAdSuggestions, useDismissAdSuggestions } from '../api/ads';
import { AdProductPicker } from './ad-product-picker';
import { formatShortDate } from '@/lib/format-date';

const statusLabels = {
  confirmed: 'Confirmed',
  suggested: 'To confirm',
  unlinked: 'No products',
};
const statusVariants = { confirmed: 'success', suggested: 'warning', unlinked: 'neutral' } as const;

function names(products: AdListItem['products']) {
  return products.map(({ name }) => name).join(', ');
}

function AdSummary({ ad }: { ad: AdListItem }) {
  if (ad.status === 'confirmed') return <p>Answers use: {names(ad.products)}</p>;
  if (ad.status === 'suggested')
    return (
      <p>
        This ad looks like: <strong>{names(ad.suggestions)}</strong>. Until you confirm, Dakly asks
        the customer which product they mean.
      </p>
    );
  return (
    <p className="text-text-muted">
      Dakly could not match this ad. It asks the customer which product they mean.
    </p>
  );
}

function AdActions({ ad, onPick }: { ad: AdListItem; onPick: () => void }) {
  const confirm = useConfirmAdSuggestions();
  const dismiss = useDismissAdSuggestions();
  const toast = useToast();
  const key = { source: ad.source, externalId: ad.externalId };
  const run = async (mutation: typeof confirm) => {
    try {
      await mutation.mutateAsync({ key, input: undefined });
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Try again');
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      {ad.status === 'suggested' ? (
        <>
          <Button loading={confirm.isPending} onClick={() => void run(confirm)}>
            Confirm
          </Button>
          <Button variant="secondary" loading={dismiss.isPending} onClick={() => void run(dismiss)}>
            Not these
          </Button>
        </>
      ) : null}
      <Button variant="secondary" onClick={onPick}>
        {ad.status === 'confirmed' ? 'Change products' : 'Pick products'}
      </Button>
    </div>
  );
}

function AdCard({ ad, canEdit }: { ad: AdListItem; canEdit: boolean }) {
  const [picking, setPicking] = useState(false);
  return (
    <li className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex gap-3">
        {ad.photoUrl ? (
          <Image
            unoptimized
            src={ad.photoUrl}
            alt=""
            width={64}
            height={64}
            className="size-16 shrink-0 rounded-md object-cover"
          />
        ) : null}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">
              {ad.title ?? (ad.source === 'ad' ? 'Ad' : 'Post')} {ad.externalId}
            </span>
            <Badge variant={statusVariants[ad.status]} className="shrink-0 whitespace-nowrap">
              {statusLabels[ad.status]}
            </Badge>
          </div>
          <time dateTime={ad.lastSeenAt} className="text-sm text-text-muted">
            Last customer {formatShortDate(ad.lastSeenAt)}
          </time>
        </div>
      </div>
      <AdSummary ad={ad} />
      {canEdit ? <AdActions ad={ad} onPick={() => setPicking(true)} /> : null}
      {picking ? (
        <AdProductPicker
          adKey={{ source: ad.source, externalId: ad.externalId }}
          selected={ad.products}
          onDone={() => setPicking(false)}
        />
      ) : null}
    </li>
  );
}

export function AdsTab({ canEdit }: { canEdit: boolean }) {
  const ads = useAds();
  if (ads.isPending) return <Skeleton className="h-96 w-full" />;
  if (ads.isError)
    return <QueryError message={ads.error.message} onRetry={() => void ads.refetch()} />;
  return (
    <div className="space-y-4">
      <p className="text-text-muted">
        When a customer messages from an ad, Dakly reads the ad and suggests the products it shows.
        Confirm them, or pick up to 4 yourself, and Dakly answers “দাম কত?” with those prices.
      </p>
      {ads.data.items.length === 0 ? (
        <p className="text-text-muted">
          No customer has messaged from an ad yet. Ads show up here after the first message.
        </p>
      ) : (
        <ul className="space-y-3">
          {ads.data.items.map((ad) => (
            <AdCard key={`${ad.source}:${ad.externalId}`} ad={ad} canEdit={canEdit} />
          ))}
        </ul>
      )}
    </div>
  );
}
