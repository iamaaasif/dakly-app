import { Facebook, Instagram, Music2 } from 'lucide-react';

import { cn } from '@dakly/ui/cn';

import type { SocialAccount } from '../api/get-social-accounts';

const networks = {
  facebook_page: { icon: Facebook, tile: 'bg-info text-on-primary' },
  instagram: { icon: Instagram, tile: 'bg-ai text-on-primary' },
  tiktok: { icon: Music2, tile: 'bg-text-muted text-on-primary' },
} as const;

type NetworkIconProps = {
  kind: SocialAccount['kind'] | 'tiktok';
  size?: 'small' | 'large';
};

export function NetworkIcon({ kind, size = 'large' }: NetworkIconProps) {
  const { icon: Icon, tile } = networks[kind];
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center',
        tile,
        size === 'large' ? 'size-10 rounded-md' : 'size-5 rounded-sm',
      )}
    >
      <Icon size={size === 'large' ? 20 : 12} strokeWidth={1.75} />
    </span>
  );
}
