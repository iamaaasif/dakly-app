import Link from 'next/link';

import { Checkbox } from '@dakly/ui/checkbox';

import { useBrandProfile } from '../api/brand-profile';
import { contentStudioHref } from '../content-studio-view';

// The saved profile always shapes the writing, so the box is shown ticked and cannot be changed.
export function BrandProfileRow() {
  const { data } = useBrandProfile();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-surface-muted p-3 text-sm">
      <Checkbox checked disabled aria-label="Use my Brand Profile" />
      <span className="font-medium">Use my Brand Profile</span>
      {data && (
        <span className="min-w-0 text-text-muted">{data.voice ?? 'No voice saved yet'}</span>
      )}
      <Link
        href={contentStudioHref({ tab: 'brand' })}
        className="ml-auto font-semibold text-action hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        Edit
      </Link>
    </div>
  );
}
