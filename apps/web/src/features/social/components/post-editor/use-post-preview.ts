import type { CreatePostInput } from '@dakly/contracts/social';

import { useProductPhotos } from '../../api/get-product-photos';
import type { SocialAccount } from '../../api/get-social-accounts';
import { captionFor } from '../../post-caption';
import type { PreviewNetwork } from './post-preview';
import { useUploadedPhotos } from './use-uploaded-photos';

// What the preview shows for the accounts selected so far.
export function usePostPreview(post: CreatePostInput, accounts: SocialAccount[]) {
  const uploads = useUploadedPhotos();
  const products = useProductPhotos(post.mediaFileIds.length > 0);
  const known = new Map([
    ...(products.data ?? []).flatMap(({ photos }) =>
      photos.map((photo) => [photo.id, photo.url] as const),
    ),
    ...uploads.photos.map((photo) => [photo.id, photo.url] as const),
  ]);
  const selected = accounts.filter(({ id }) =>
    post.targets.some(({ channelConnectionId }) => channelConnectionId === id),
  );
  return {
    uploads,
    networks: [...new Set(selected.map(({ kind }) => kind))],
    photos: post.mediaFileIds.flatMap((id) => {
      const url = known.get(id);
      return url ? [{ id, url }] : [];
    }),
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
