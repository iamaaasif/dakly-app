// One interface per capability, one driver per vendor (messenger/, instagram/, whatsapp/).
// Drivers turn vendor payloads into these types; vendor shapes never reach core.
// See docs/rules/providers.md.

export type ChannelKind = 'messenger' | 'instagram' | 'whatsapp';

export type InboundMessage = {
  channel: ChannelKind;
  accountExternalId: string;
  externalConversationId: string;
  externalMessageId: string;
  senderExternalId: string;
  text: string | null;
  attachmentUrls: string[];
  sentAt: Date;
};

export type OutboundMessage = {
  channel: Exclude<ChannelKind, 'whatsapp'>;
  externalConversationId: string;
  text: string;
  operationKey: string;
  humanAgent?: boolean;
};

export type SendResult = {
  externalMessageId: string;
};

export type ChannelDriver = {
  readonly kind: ChannelKind;
  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string): boolean;
  parseWebhook(payload: unknown): InboundMessage[];
  send(credentials: ChannelCredentials, message: OutboundMessage): Promise<SendResult>;
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
};

export type MetaTokenHealthDriver = {
  isTokenValid(accessToken: string): Promise<boolean>;
};

const metaRequestError = Symbol.for('dakly.meta-request-error');

export class MetaRequestError extends Error {
  readonly [metaRequestError] = true;

  // The driver and its caller can load this class through different package entry points.
  static override [Symbol.hasInstance](error: unknown): boolean {
    return typeof error === 'object' && error !== null && metaRequestError in error;
  }

  constructor(readonly code: 'auth_error' | 'unavailable' | 'invalid_response' | 'rejected') {
    super('Meta request failed');
    this.name = 'MetaRequestError';
  }
}
