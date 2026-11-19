export type MetaPostingAccount = { accountId: string; accessToken: string };

export type MetaPost = {
  kind: 'post' | 'story';
  caption: string;
  linkUrl: string | null;
  photoUrls: string[];
};

export type InstagramContainerState = 'processing' | 'ready' | 'published' | 'failed';

export type MetaPublishingDriver = {
  uploadFacebookPhotos(account: MetaPostingAccount, photoUrls: string[]): Promise<string[]>;
  publishFacebook(account: MetaPostingAccount, post: MetaPost, photoIds: string[]): Promise<string>;
  createInstagramContainer(account: MetaPostingAccount, post: MetaPost): Promise<string>;
  instagramContainerState(
    account: MetaPostingAccount,
    containerId: string,
  ): Promise<InstagramContainerState>;
  publishInstagram(account: MetaPostingAccount, containerId: string): Promise<string>;
  comment(account: MetaPostingAccount, postId: string, message: string): Promise<void>;
};

const messages = {
  auth_error: 'Meta rejected the account token',
  rejected: 'Meta rejected the request',
  retryable: 'Meta asked to retry the request',
  unavailable: 'Meta did not confirm the result',
};

export class MetaPublishingError extends Error {
  constructor(readonly code: keyof typeof messages) {
    super(messages[code]);
  }
}
