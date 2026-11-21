import { createHash } from 'node:crypto';

import {
  MetaRequestError,
  type ChannelCredentials,
  type ChannelDriver,
  type CommentDriver,
  type MediaDownload,
  type MetaAuthorizationDriver,
  type MetaPage,
  type MetaTokenHealthDriver,
  type OutboundMessage,
} from '../channel-driver';

const authorizationCode = 'dakly-local-meta-code';
const userToken = 'fake-meta-user-credential';
const pages: MetaPage[] = [
  {
    id: '1001001',
    name: 'রিনার দোকান',
    accessToken: 'fake-rina-page-credential',
    instagram: { id: '1002001', name: 'rinas_shop' },
  },
  {
    id: '1001002',
    name: 'করিমের দোকান',
    accessToken: 'fake-karim-page-credential',
    instagram: null,
  },
];

function fingerprint(...parts: string[]) {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 24);
}

export class FakeMetaChannelDriver
  implements
    MetaAuthorizationDriver,
    MetaTokenHealthDriver,
    Pick<ChannelDriver, 'send' | 'downloadMedia'>,
    Omit<CommentDriver, 'parseComments'>
{
  constructor(private readonly redirectUri: string) {}

  authorizationUrl(state: string): string {
    const url = new URL(this.redirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('code', authorizationCode);
    return url.href;
  }

  async exchangeAuthorizationCode(code: string): Promise<string> {
    if (code !== authorizationCode) throw new MetaRequestError('auth_error');
    return userToken;
  }

  async listAccounts(credential: string): Promise<MetaPage[]> {
    if (credential !== userToken) throw new MetaRequestError('auth_error');
    return structuredClone(pages);
  }

  async subscribePage(pageId: string, accessToken: string): Promise<void> {
    if (!pages.some((page) => page.id === pageId && page.accessToken === accessToken))
      throw new MetaRequestError('auth_error');
  }

  async unsubscribePage(pageId: string, accessToken: string): Promise<void> {
    if (!pages.some((page) => page.id === pageId && page.accessToken === accessToken))
      throw new MetaRequestError('auth_error');
  }

  async isTokenValid(accessToken: string): Promise<boolean> {
    return pages.some((page) => page.accessToken === accessToken);
  }

  async send({ accountExternalId, accessToken }: ChannelCredentials, message: OutboundMessage) {
    const connected = pages.some((page) => {
      const account = message.channel === 'messenger' ? page.id : page.instagram?.id;
      return account === accountExternalId && page.accessToken === accessToken;
    });
    if (!connected) throw new MetaRequestError('auth_error');
    const reference = JSON.stringify([message.channel, accountExternalId, message.operationKey]);
    const externalMessageId = `fake-${createHash('sha256').update(reference).digest('hex')}`;
    return { externalMessageId };
  }

  async replyToComment(
    credentials: ChannelCredentials,
    comment: Parameters<CommentDriver['replyToComment']>[1],
  ) {
    this.requireConnected(comment.channel, credentials);
    return {
      externalReplyId: `fake-reply-${fingerprint(comment.externalCommentId, comment.text)}`,
    };
  }

  async sendPrivateReply(
    credentials: ChannelCredentials,
    comment: Parameters<CommentDriver['sendPrivateReply']>[1],
  ) {
    this.requireConnected(comment.channel, credentials);
    return {
      externalMessageId: `fake-private-${fingerprint(comment.externalCommentId, comment.text)}`,
      recipientExternalId: `fake-author-${fingerprint(comment.externalCommentId)}`,
    };
  }

  async setCommentHidden(
    credentials: ChannelCredentials,
    comment: Parameters<CommentDriver['setCommentHidden']>[1],
  ) {
    this.requireConnected(comment.channel, credentials);
  }

  private requireConnected(
    channel: 'messenger' | 'instagram',
    { accountExternalId, accessToken }: ChannelCredentials,
  ) {
    const connected = pages.some((page) => {
      const account = channel === 'messenger' ? page.id : page.instagram?.id;
      return account === accountExternalId && page.accessToken === accessToken;
    });
    if (!connected) throw new MetaRequestError('auth_error');
  }

  // Development has no Meta CDN: a link containing "expired" behaves like an old one.
  async downloadMedia(accessToken: string, url: string, maxBytes: number): Promise<MediaDownload> {
    if (!pages.some((page) => page.accessToken === accessToken))
      throw new MetaRequestError('auth_error');
    if (url.includes('expired')) return { kind: 'expired' };
    const bytes = new TextEncoder().encode('fake media');
    return bytes.byteLength > maxBytes
      ? { kind: 'too_large' }
      : { kind: 'downloaded', bytes, contentType: 'image/jpeg' };
  }
}
