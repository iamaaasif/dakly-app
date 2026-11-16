import { describe, expect, it } from 'vitest';

import { FakeSmsDriver } from './fake-sms-driver';

describe('FakeSmsDriver', () => {
  it('records a copy of each message and returns a distinct message id', async () => {
    const driver = new FakeSmsDriver();
    const message = { to: '+8801700000000', text: 'আপনার কোড 123456' };
    const first = await driver.send(message);
    message.text = 'changed';
    const second = await driver.send({ to: '+8801800000000', text: 'second' });

    expect(driver.messages).toEqual([
      { to: '+8801700000000', text: 'আপনার কোড 123456' },
      { to: '+8801800000000', text: 'second' },
    ]);
    expect(first.providerMessageId).not.toBe('');
    expect(second.providerMessageId).not.toBe(first.providerMessageId);
  });

  it('records a message once per idempotency key and returns the first result again', async () => {
    const driver = new FakeSmsDriver();
    const message = { to: '01712345678', text: 'ঈদ অফার', idempotencyKey: 'campaign-1' };
    const first = await driver.send(message);
    const second = await driver.send(message);

    expect(second).toEqual(first);
    expect(driver.messages).toHaveLength(1);
  });
});
