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
});
