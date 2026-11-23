import { describe, expect, it, vi } from 'vitest';

import { AppError } from '../platform/errors/app-error';
import { AdReadingService } from './ad-reading.service';

const referral = {
  adId: '120000000001',
  postId: null,
  title: 'ঈদের কুর্তি',
  photoUrl: 'https://scontent.xx.fbcdn.net/ad.jpg',
  channelConnectionId: 'connection-1',
  channel: 'messenger' as const,
  referredAt: new Date(),
};
const reading = {
  subject: 'product' as const,
  description: 'A blue kurti',
  searchWords: ['kurti', 'কুর্তি'],
  visibleText: '',
};
const product = { id: 'product-1' };

type Setup = {
  referral?: typeof referral | null;
  state?: 'pending' | 'read' | 'unreadable';
  linked?: string[];
  download?: { kind: 'downloaded'; bytes: Uint8Array; contentType: string } | { kind: 'expired' };
  ai?: { kind: 'output'; output: typeof reading } | { kind: 'failure'; code: string };
  allowance?: boolean;
  match?: { kind: string; product?: unknown; products?: unknown[] };
};

function build(setup: Setup = {}) {
  const sources = {
    noteSeen: vi.fn(async () => ({
      readState: setup.state ?? 'pending',
      title: referral.title,
      photoUrl: referral.photoUrl,
    })),
    finishReading: vi.fn(async () => undefined),
  };
  const ai = {
    run: vi.fn(async () => setup.ai ?? { kind: 'output', output: reading }),
  };
  const search = {
    matchPhoto: vi.fn(async () => setup.match ?? { kind: 'sure', product }),
  };
  const service = new AdReadingService(
    {
      referralOf: vi.fn(async () => (setup.referral === undefined ? referral : setup.referral)),
    } as never,
    { productIdsFor: vi.fn(async () => setup.linked ?? []) } as never,
    sources as never,
    {
      prepareMetaSend: vi.fn(async () => ({})),
      downloadMetaMedia: vi.fn(
        async () =>
          setup.download ?? {
            kind: 'downloaded',
            bytes: new Uint8Array(1),
            contentType: 'image/jpeg',
          },
      ),
    } as never,
    search as never,
    ai as never,
    {
      isConsumed: vi.fn(async () => false),
      hasAllowance: vi.fn(async () => setup.allowance ?? true),
    } as never,
  );
  return { service, sources, ai, search };
}

const key = { source: 'ad', externalId: '120000000001' };

describe('AdReadingService', () => {
  it('saves the matched product as a suggestion', async () => {
    const { service, sources, search } = build();
    await service.readFromChat('store-1', 'conversation-1');
    expect(search.matchPhoto).toHaveBeenCalledWith('store-1', expect.stringContaining('ঈদের কুর্তি'));
    expect(sources.finishReading).toHaveBeenCalledWith('store-1', key, {
      readState: 'read',
      origin: 'photo',
      productIds: ['product-1'],
    });
  });

  it('saves several products when the picture could be any of them, at most four', async () => {
    const products = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));
    const { service, sources } = build({ match: { kind: 'unsure', products } });
    await service.readFromChat('store-1', 'conversation-1');
    expect(sources.finishReading).toHaveBeenCalledWith('store-1', key, {
      readState: 'read',
      origin: 'photo',
      productIds: ['a', 'b', 'c', 'd'],
    });
  });

  it('saves no suggestion when nothing in the shop fits', async () => {
    const { service, sources } = build({ match: { kind: 'none' } });
    await service.readFromChat('store-1', 'conversation-1');
    expect(sources.finishReading).toHaveBeenCalledWith('store-1', key, {
      readState: 'read',
      origin: 'photo',
      productIds: [],
    });
  });

  it('does nothing for a chat that did not start from an ad', async () => {
    const { service, sources } = build({ referral: null });
    await service.readFromChat('store-1', 'conversation-1');
    expect(sources.noteSeen).not.toHaveBeenCalled();
  });

  it('reads an ad only once', async () => {
    const { service, sources, ai } = build({ state: 'read' });
    await service.readFromChat('store-1', 'conversation-1');
    expect(ai.run).not.toHaveBeenCalled();
    expect(sources.finishReading).not.toHaveBeenCalled();
  });

  it('suggests nothing for an ad the owner already linked', async () => {
    const { service, sources, ai } = build({ linked: ['product-9'] });
    await service.readFromChat('store-1', 'conversation-1');
    expect(ai.run).not.toHaveBeenCalled();
    expect(sources.finishReading).toHaveBeenCalledWith('store-1', key, {
      readState: 'read',
      origin: 'photo',
      productIds: [],
    });
  });

  it('matches on the title alone when the picture has expired', async () => {
    const { service, ai, search } = build({ download: { kind: 'expired' } });
    await service.readFromChat('store-1', 'conversation-1');
    expect(ai.run).not.toHaveBeenCalled();
    expect(search.matchPhoto).toHaveBeenCalledWith('store-1', 'ঈদের কুর্তি');
  });

  it('marks an ad with no title and no readable picture as unreadable', async () => {
    const { service, sources } = build({ download: { kind: 'expired' } });
    sources.noteSeen.mockResolvedValueOnce({
      readState: 'pending',
      title: null as never,
      photoUrl: referral.photoUrl,
    });
    await service.readFromChat('store-1', 'conversation-1');
    expect(sources.finishReading).toHaveBeenCalledWith('store-1', key, {
      readState: 'unreadable',
      origin: 'photo',
      productIds: [],
    });
  });

  it('throws when the model is down so the queue tries again', async () => {
    const { service, sources } = build({ ai: { kind: 'failure', code: 'LLM_TIMEOUT' } });
    await expect(service.readFromChat('store-1', 'conversation-1')).rejects.toBeInstanceOf(
      AppError,
    );
    expect(sources.finishReading).not.toHaveBeenCalled();
  });
});
