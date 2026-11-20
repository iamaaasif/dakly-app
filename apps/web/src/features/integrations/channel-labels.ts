import type { ChannelConnection } from '@dakly/contracts/channels';

export type MetaKind = Extract<ChannelConnection['kind'], 'facebook_page' | 'instagram'>;

export const metaChannels: Record<
  MetaKind,
  { name: string; account: string; description: string }
> = {
  facebook_page: {
    name: 'Messenger',
    account: 'Facebook Page',
    description: 'Answer customers who message your Facebook Page.',
  },
  instagram: {
    name: 'Instagram',
    account: 'Instagram account',
    description: 'Answer customers who message your Instagram business account.',
  },
};
