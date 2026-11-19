import { z } from 'zod';

export const channelConnectionKinds = ['facebook_page', 'instagram', 'whatsapp'] as const;
export const channelConnectionStatuses = ['active', 'needs_reconnect', 'disconnected'] as const;
// Chat channels. SMS is sent through Dakly's own SMS driver and is never a chat.
export const chatChannels = ['messenger', 'instagram', 'whatsapp'] as const;
export const smsSenderIdStatuses = ['requested', 'in_review', 'approved', 'rejected'] as const;

const metaGrantIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{43}$/);

export const metaAuthorizationInputSchema = z.strictObject({
  state: metaGrantIdSchema,
  code: z.string().min(1).max(4096),
});

export type MetaAuthorizationInput = z.infer<typeof metaAuthorizationInputSchema>;
export type MetaAuthorizationStart = { authorizationUrl: string };
export type MetaAuthorizationAccounts = {
  selectionId: string;
  pages: {
    id: string;
    name: string;
    instagram: { id: string; name: string } | null;
  }[];
};

export type ChannelConnection = {
  id: string;
  kind: (typeof channelConnectionKinds)[number];
  displayName: string;
  externalAccountId: string;
  status: (typeof channelConnectionStatuses)[number];
  tokenExpiresAt: string | null;
  connectedAt: string;
  disconnectedAt: string | null;
};

export const metaSelectionInputSchema = z.strictObject({
  selectionId: metaGrantIdSchema,
  accounts: z
    .array(
      z.strictObject({
        kind: z.enum(['facebook_page', 'instagram']),
        externalAccountId: z.string().regex(/^\d{1,32}$/),
      }),
    )
    .nonempty(),
});

export type MetaSelectionInput = z.infer<typeof metaSelectionInputSchema>;
