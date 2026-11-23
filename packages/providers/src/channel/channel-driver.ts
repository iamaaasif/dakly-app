// One interface per capability, one driver per vendor (messenger/, instagram/, whatsapp/).
// Drivers turn vendor payloads into these types; vendor shapes never reach core.
// See docs/rules/providers.md.

export type ChannelKind = 'messenger' | 'instagram' | 'whatsapp';

export type InboundAttachmentKind = 'image' | 'voice' | 'video' | 'file';

export type InboundAttachment = { kind: InboundAttachmentKind; url: string };

// Where a customer's first message came from. An ad that promotes a post carries both ids.
export type InboundReferral = {
  adId: string | null;
  postId: string | null;
  title: string | null;
  // The ad's picture as Meta shows it in the first message; null for a video or a text-only ad.
  photoUrl: string | null;
};

export type InboundMessage = {
  channel: ChannelKind;
  accountExternalId: string;
  externalConversationId: string;
  externalMessageId: string;
  senderExternalId: string;
  text: string | null;
  attachments: InboundAttachment[];
  referral: InboundReferral | null;
  sentAt: Date;
};

// A tap on a button the shop sent. The payload is the string the shop attached to that button.
export type InboundPostback = {
  channel: Exclude<ChannelKind, 'whatsapp'>;
  accountExternalId: string;
  senderExternalId: string;
  payload: string;
  occurredAt: Date;
};

export type ChannelReceipt = {
  channel: Exclude<ChannelKind, 'whatsapp'>;
  accountExternalId: string;
  recipientExternalId: string;
  occurredAt: Date;
} & (
  | ({ kind: 'delivered' | 'read' } & ({ externalMessageIds: string[] } | { through: Date }))
  | {
      kind: 'echo';
      externalMessageId: string;
      operationKey: string;
      appExternalId: string;
    }
);

export type OutboundButton = { title: string; payload: string };

// A product card or a swipeable row of up to 10, sent as a Meta generic template.
export type OutboundCardButton =
  | { type: 'postback'; title: string; payload: string }
  | { type: 'link'; title: string; url: string };
export type OutboundCard = {
  elements: {
    title: string;
    subtitle: string;
    imageUrl?: string;
    buttons: OutboundCardButton[];
  }[];
};

export type OutboundMessage = {
  externalConversationId: string;
  text: string;
  operationKey: string;
  humanAgent?: boolean;
} & (
  | { channel: 'instagram'; imageUrl?: string; card?: OutboundCard }
  | { channel: 'messenger'; imageUrl?: string; buttons?: OutboundButton[]; card?: OutboundCard }
);

// An expired link is a final answer; an outage is not, so the driver throws for that.
export type MediaDownload =
  | { kind: 'downloaded'; bytes: Uint8Array; contentType: string }
  | { kind: 'expired' }
  | { kind: 'too_large' };

export type SendResult = {
  externalMessageId: string;
  // Set when Meta refused the image and the text still went out.
  imageRejected?: true;
};

// A comment on one of the shop's own Facebook Page posts or Instagram media.
export type InboundComment = {
  channel: Exclude<ChannelKind, 'whatsapp'>;
  accountExternalId: string;
  externalPostId: string;
  externalCommentId: string;
  parentExternalCommentId: string | null;
  authorExternalId: string;
  authorName: string | null;
  text: string;
  commentedAt: Date;
};

type CommentTarget = {
  channel: Exclude<ChannelKind, 'whatsapp'>;
  externalCommentId: string;
};

export type CommentDriver = {
  parseComments(payload: unknown): InboundComment[];
  replyToComment(
    credentials: ChannelCredentials,
    comment: CommentTarget & { text: string },
  ): Promise<{ externalReplyId: string }>;
  // Meta allows one private reply per comment, within 7 days, and opens a chat with the author.
  sendPrivateReply(
    credentials: ChannelCredentials,
    comment: CommentTarget & { text: string },
  ): Promise<{ externalMessageId: string; recipientExternalId: string }>;
  setCommentHidden(
    credentials: ChannelCredentials,
    comment: CommentTarget & { hidden: boolean },
  ): Promise<void>;
};

// Meta gives a name only; it never gives a phone number or an email address.
export type ContactProfile = { name: string | null };

export type ProfileDriver = {
  // Null when Meta refuses the lookup, for example a missing permission or a blocked user.
  fetchProfile(
    accessToken: string,
    target: { channel: Exclude<ChannelKind, 'whatsapp'>; externalId: string },
  ): Promise<ContactProfile | null>;
};

export type ChannelDriver = {
  readonly kind: ChannelKind;
  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string): boolean;
  parseWebhook(payload: unknown): InboundMessage[];
  parseReceipts(payload: unknown): ChannelReceipt[];
  parsePostbacks(payload: unknown): InboundPostback[];
  send(credentials: ChannelCredentials, message: OutboundMessage): Promise<SendResult>;
  downloadMedia(accessToken: string, url: string, maxBytes: number): Promise<MediaDownload>;
};

export type ChannelCredentials = {
  accessToken: string;
  accountExternalId: string;
};

export type MetaPage = {
  id: string;
  name: string;
  accessToken: string;
  instagram: { id: string; name: string } | null;
};

export type MetaAuthorizationDriver = {
  authorizationUrl(state: string): string;
  exchangeAuthorizationCode(code: string): Promise<string>;
  listAccounts(userToken: string): Promise<MetaPage[]>;
  subscribePage(pageId: string, accessToken: string): Promise<void>;
  unsubscribePage(pageId: string, accessToken: string): Promise<void>;
};

export type MetaTokenHealthDriver = {
  isTokenValid(accessToken: string): Promise<boolean>;
};

export class MetaRequestError extends Error {
  constructor(readonly code: 'auth_error' | 'unavailable' | 'invalid_response' | 'rejected') {
    super('Meta request failed');
    this.name = 'MetaRequestError';
  }
}
