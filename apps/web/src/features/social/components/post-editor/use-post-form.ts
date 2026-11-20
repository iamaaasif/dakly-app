import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type Resolver } from 'react-hook-form';

import { createPostSchema, type CreatePostInput } from '@dakly/contracts/social';

import type { SocialAccount } from '../../api/get-social-accounts';

export function usePostForm(accounts: SocialAccount[], initial?: Partial<CreatePostInput>) {
  return useForm<CreatePostInput>({
    // The schema fills defaults, so its input type is looser than the form values.
    resolver: zodResolver(createPostSchema) as Resolver<CreatePostInput>,
    defaultValues: createPostSchema.parse({
      ...initial,
      targets:
        initial?.targets ??
        accounts
          .filter(({ status }) => status === 'active')
          .map(({ id }) => ({ channelConnectionId: id, captionOverride: null })),
    }),
  });
}
