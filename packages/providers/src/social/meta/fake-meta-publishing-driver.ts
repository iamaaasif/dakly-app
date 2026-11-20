import {
  type InstagramContainerState,
  type MetaPostMetrics,
  type MetaPostingAccount,
  type MetaPublishingDriver,
} from '../meta-publishing-driver';

export class FakeMetaPublishingDriver implements MetaPublishingDriver {
  private sequence = 0;
  private readonly published = new Set<string>();
  private readonly metrics = new Map<string, MetaPostMetrics>();

  setMetrics(externalPostId: string, metrics: Omit<MetaPostMetrics, 'rejectedInsights'>) {
    this.metrics.set(externalPostId, { ...metrics, rejectedInsights: null });
  }

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

  async postMetrics(_account: MetaPostingAccount, { externalPostId }: { externalPostId: string }) {
    return (
      this.metrics.get(externalPostId) ?? {
        reach: 120,
        reactions: 14,
        comments: 3,
        shares: 2,
        rejectedInsights: null,
      }
    );
  }
}
