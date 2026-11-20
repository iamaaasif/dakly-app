import type { ChannelConnection } from '@dakly/contracts/channels';

export type MetaKind = Extract<ChannelConnection['kind'], 'facebook_page' | 'instagram'>;

export const metaChannels: Record<
  MetaKind,
  { name: string; account: string; connect: string; description: string }
> = {
  facebook_page: {
    name: 'Messenger',
    account: 'Facebook Page',
    connect: 'Connect Facebook Page',
    description: 'Answer customers who message your Facebook Page.',
  },
  instagram: {
    name: 'Instagram',
    account: 'Instagram account',
    connect: 'Connect Instagram',
    description: 'Answer customers who message your Instagram business account.',
  },
};
