import { describe, expect, it, vi } from 'vitest';

import { MetaRequestError } from '@dakly/providers/channel/channel-driver';

import { ContactProfileService } from './contact-profile.service';

const identity = {
  id: 'identity-1',
  connectionId: 'connection-1',
  channel: 'messenger' as const,
  externalId: '999',
};

function build(fetchMetaProfile: () => Promise<{ name: string | null } | null>) {
  const identities = {
    findUnnamedMetaIdentities: vi.fn(async () => [identity]),
    recordProfileName: vi.fn(async () => undefined),
  };
  const connections = {
    prepareMetaSend: vi.fn(async () => ({})),
    fetchMetaProfile: vi.fn(fetchMetaProfile),
  };
  const service = new ContactProfileService(identities as never, connections as never);
  return { service, identities };
}

describe('ContactProfileService', () => {
  it('saves the name Meta gives', async () => {
    const { service, identities } = build(async () => ({ name: 'Karim Uddin' }));
    await service.fetchName('store-1', 'contact-1');
    expect(identities.recordProfileName).toHaveBeenCalledWith('store-1', {
      identityId: 'identity-1',
      contactId: 'contact-1',
      name: 'Karim Uddin',
    });
  });

  it('saves nothing when Meta refuses, so the next message tries again', async () => {
    const { service, identities } = build(async () => null);
    await service.fetchName('store-1', 'contact-1');
    expect(identities.recordProfileName).not.toHaveBeenCalled();
  });

  it('throws on an outage so the queue retries', async () => {
    const { service } = build(async () => {
      throw new MetaRequestError('unavailable');
    });
    await expect(service.fetchName('store-1', 'contact-1')).rejects.toMatchObject({
      code: 'unavailable',
    });
  });
});
