import type { CreatePostInput } from '@dakly/contracts/social';

import type { SocialAccount } from '../../api/get-social-accounts';
import { captionFor } from '../../post-caption';
import type { PreviewNetwork } from './post-preview';

// What the preview shows for the accounts selected so far.
export function usePostPreview(post: CreatePostInput, accounts: SocialAccount[]) {
  const selected = accounts.filter(({ id }) =>
    post.targets.some(({ channelConnectionId }) => channelConnectionId === id),
  );
  return {
    networks: [...new Set(selected.map(({ kind }) => kind))],
    photos: [],
    accountName: (network: PreviewNetwork) =>
      (
        selected.find(({ kind }) => kind === network) ??
        accounts.find(({ kind }) => kind === network)
      )?.displayName ?? '',
    caption: (network: PreviewNetwork) => {
      const account = selected.find(({ kind }) => kind === network);
      return account ? captionFor(post, account.id) : (post.caption ?? '');
    },
  };
}
