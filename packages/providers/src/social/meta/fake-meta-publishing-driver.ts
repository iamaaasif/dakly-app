import {
  type InstagramContainerState,
  type MetaPostingAccount,
  type MetaPublishingDriver,
} from '../meta-publishing-driver';

export class FakeMetaPublishingDriver implements MetaPublishingDriver {
  private sequence = 0;
  private readonly published = new Set<string>();

  async uploadFacebookPhotos(_account: MetaPostingAccount, photoUrls: string[]) {
    return photoUrls.map(() => `fake-photo-${++this.sequence}`);
  }

  async publishFacebook() {
    return `fake-facebook-post-${++this.sequence}`;
  }

  async createInstagramContainer() {
    return `fake-container-${++this.sequence}`;
  }

  async instagramContainerState(
    _account: MetaPostingAccount,
    containerId: string,
  ): Promise<InstagramContainerState> {
    return this.published.has(containerId) ? 'published' : 'ready';
  }

  async publishInstagram(_account: MetaPostingAccount, containerId: string) {
    this.published.add(containerId);
    return `fake-instagram-post-${++this.sequence}`;
  }

  async comment() {}
}
