import {
  MetaRequestError,
  type MetaAuthorizationDriver,
  type MetaPage,
  type MetaTokenHealthDriver,
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

export class FakeMetaChannelDriver implements MetaAuthorizationDriver, MetaTokenHealthDriver {
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

  async isTokenValid(accessToken: string): Promise<boolean> {
    return pages.some((page) => page.accessToken === accessToken);
  }
}
