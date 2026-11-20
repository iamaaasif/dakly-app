import type { SocialAccount } from './api/get-social-accounts';

export const networkNames: Record<SocialAccount['kind'], string> = {
  facebook_page: 'Facebook',
  instagram: 'Instagram',
};

export const accountTypeLabels: Record<SocialAccount['kind'], string> = {
  facebook_page: 'Facebook Page',
  instagram: 'Instagram',
};
