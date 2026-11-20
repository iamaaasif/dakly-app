import { FakeMetaChannelDriver } from '@dakly/providers/channel/meta/fake-meta-channel-driver';
import { MetaGraphChannelDriver } from '@dakly/providers/channel/meta/meta-graph-channel-driver';

import { loadEnv } from '../platform/config/env';

export const META_CHANNEL_DRIVER = Symbol('META_CHANNEL_DRIVER');

export function createMetaChannelDriver() {
  const configuration = loadEnv().metaChannel;
  if (!configuration) return null;
  return configuration.driver === 'fake'
    ? new FakeMetaChannelDriver(configuration.redirectUri)
    : new MetaGraphChannelDriver(configuration);
}
