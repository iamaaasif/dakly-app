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

export class MetaPublishingError extends Error {
  constructor(readonly code: 'rejected' | 'unavailable') {
    super(code === 'rejected' ? 'Meta rejected the request' : 'Meta did not confirm the result');
  }
}
