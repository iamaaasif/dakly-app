import { ExternalLink } from 'lucide-react';

import type { SocialAccount } from '../api/get-social-accounts';
import { networkNames } from '../social-labels';

type ViewPostLinkProps = { permalink: string | null; kind: SocialAccount['kind'] | undefined };

// Opens the post where it was published, on Facebook or Instagram.
export function ViewPostLink({ permalink, kind }: ViewPostLinkProps) {
  if (!permalink?.startsWith('https://') || !kind) return null;
  return (
    <a
      href={permalink}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-sm font-medium text-action hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      View on {networkNames[kind]} <ExternalLink aria-hidden="true" size={14} strokeWidth={1.75} />
    </a>
  );
}
