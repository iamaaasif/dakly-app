import { expect, it } from 'vitest';

import { FakeMetaChannelDriver } from './fake-meta-channel-driver';

const driver = new FakeMetaChannelDriver('https://shop.example.test/integrations/meta');
const reply = {
  channel: 'instagram',
  externalConversationId: '999',
  text: 'জি, পণ্যটি আছে।',
  operationKey: 'message-one',
} as const;
const credentials = {
  accountExternalId: '1002001',
  accessToken: 'fake-rina-page-credential',
};

it('accepts a linked Instagram account and identifies the same operation consistently', async () => {
  const first = await driver.send(credentials, reply);
  await expect(driver.send(credentials, reply)).resolves.toEqual(first);
  await expect(
    driver.send(credentials, { ...reply, operationKey: 'message-two' }),
  ).resolves.not.toEqual(first);
});

it('rejects the Page token of a different account', async () => {
  await expect(
    driver.send({ ...credentials, accessToken: 'fake-karim-page-credential' }, reply),
  ).rejects.toMatchObject({ code: 'auth_error' });
});
