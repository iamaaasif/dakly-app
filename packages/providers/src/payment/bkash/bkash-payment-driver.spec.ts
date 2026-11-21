import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { BkashPaymentDriver } from './bkash-payment-driver';

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8');

const credentials = { appKey: 'key', appSecret: 'secret', username: 'user', password: 'pass' };
const shop = {
  flow: 'shop',
  mode: 'sandbox',
  credentials: Buffer.from(JSON.stringify(credentials)),
} as const;

function scripted(replies: Record<string, string[]>) {
  const calls: { path: string; headers: Headers; body: unknown }[] = [];
  const request: typeof fetch = async (url, init) => {
    const call = new Request(url, init);
    const path = new URL(call.url).pathname.replace(/^.*\/checkout\//, '');
    calls.push({ path, headers: call.headers, body: await call.json() });
    const reply = replies[path]?.shift();
    if (reply === undefined) return new Response('boom', { status: 500 });
    return new Response(reply, { status: 200 });
  };
  return { request, calls };
}

describe('BkashPaymentDriver', () => {
  it('creates a payment with the amount in taka and returns the payment page', async () => {
    const { request, calls } = scripted({
      'token/grant': [fixture('token-grant')],
      create: [fixture('create-payment')],
    });
    const result = await new BkashPaymentDriver({}, request).createPayment(
      { amountPoisha: 12000, orderReference: 'inv-1', callbackUrl: 'https://api.dakly.test/cb' },
      shop,
    );
    expect(result).toEqual({
      gatewayPaymentId: 'TR0011abc',
      redirectUrl: 'https://sandbox.payment.bkash.com/?paymentId=TR0011abc',
    });
    expect(calls[0]!.headers.get('username')).toBe('user');
    expect(calls[1]!.headers.get('authorization')).toBe('tok-1');
    expect(calls[1]!.headers.get('x-app-key')).toBe('key');
    expect(calls[1]!.body).toMatchObject({
      amount: '120.00',
      currency: 'BDT',
      intent: 'sale',
      merchantInvoiceNumber: 'inv-1',
    });
  });

  it('formats poisha without float rounding', async () => {
    const { request, calls } = scripted({
      'token/grant': [fixture('token-grant')],
      create: [fixture('create-payment')],
    });
    await new BkashPaymentDriver({}, request).createPayment(
      { amountPoisha: 10305, orderReference: 'inv-2', callbackUrl: 'https://api.dakly.test/cb' },
      shop,
    );
    expect(calls[1]!.body).toMatchObject({ amount: '103.05' });
  });

  it('reuses the token until it is about to expire, then grants a new one', async () => {
    let now = 0;
    const { request, calls } = scripted({
      'token/grant': [fixture('token-grant'), fixture('token-grant')],
      'payment/status': [
        fixture('status-initiated'),
        fixture('status-initiated'),
        fixture('status-initiated'),
      ],
    });
    const driver = new BkashPaymentDriver({ now: () => now }, request);
    await driver.getStatus('TR0011abc', shop);
    await driver.getStatus('TR0011abc', shop);
    expect(calls.filter((call) => call.path === 'token/grant')).toHaveLength(1);
    now = 3_600_000;
    await driver.getStatus('TR0011abc', shop);
    expect(calls.filter((call) => call.path === 'token/grant')).toHaveLength(2);
  });

  it('reports a paid result from execute with the verified amount, invoice and trxID', async () => {
    const { request } = scripted({
      'token/grant': [fixture('token-grant')],
      execute: [fixture('execute-completed')],
    });
    expect(await new BkashPaymentDriver({}, request).getStatus('TR0011abc', shop)).toEqual({
      status: 'paid',
      amountPoisha: 12000,
      currency: 'BDT',
      merchantReference: 'inv-1',
      transactionId: 'BK1234XYZ',
    });
  });

  it('falls back to query when execute is refused, and reports paid if already completed', async () => {
    const { request } = scripted({
      'token/grant': [fixture('token-grant')],
      execute: [fixture('execute-not-authorized')],
      'payment/status': [fixture('status-completed')],
    });
    expect(await new BkashPaymentDriver({}, request).getStatus('TR0011abc', shop)).toMatchObject({
      status: 'paid',
      transactionId: 'BK1234XYZ',
    });
  });

  it('falls back to query when execute fails at the network, and stays pending if not paid', async () => {
    const { request } = scripted({
      'token/grant': [fixture('token-grant')],
      'payment/status': [fixture('status-initiated')],
    });
    expect(await new BkashPaymentDriver({}, request).getStatus('TR0011abc', shop)).toEqual({
      status: 'pending',
    });
  });

  it('maps failed and cancelled query results', async () => {
    for (const [transactionStatus, status] of [
      ['Failed', 'failed'],
      ['Cancelled', 'cancelled'],
    ] as const) {
      const { request } = scripted({
        'token/grant': [fixture('token-grant')],
        'payment/status': [JSON.stringify({ statusCode: '0000', transactionStatus })],
      });
      expect(await new BkashPaymentDriver({}, request).getStatus('TR0011abc', shop)).toEqual({
        status,
      });
    }
  });

  it('refuses a completed reply that has no verifiable amount', async () => {
    const { request } = scripted({
      'token/grant': [fixture('token-grant')],
      execute: [JSON.stringify({ ...JSON.parse(fixture('execute-completed')), amount: 'abc' })],
      'payment/status': [fixture('status-initiated')],
    });
    expect(await new BkashPaymentDriver({}, request).getStatus('TR0011abc', shop)).toEqual({
      status: 'pending',
    });
  });

  it('rejects bad credentials from the token call', async () => {
    const { request } = scripted({
      'token/grant': [JSON.stringify({ statusCode: '2079', statusMessage: 'Invalid app key' })],
    });
    await expect(new BkashPaymentDriver({}, request).getStatus('TR0011abc', shop)).rejects.toThrow(
      'bKash refused the credentials',
    );
  });

  it('uses the billing account only for the billing flow', async () => {
    const { request, calls } = scripted({
      'token/grant': [fixture('token-grant')],
      'payment/status': [fixture('status-initiated')],
    });
    const billing = { mode: 'live', credentials } as const;
    await new BkashPaymentDriver({ billing }, request).getStatus('TR0011abc', { flow: 'billing' });
    expect(calls[0]!.headers.get('username')).toBe('user');
    await expect(
      new BkashPaymentDriver({}, request).getStatus('TR0011abc', { flow: 'billing' }),
    ).rejects.toThrow('not configured');
  });

  it('reads the merchant reference and builds an account-scoped event id from a callback', () => {
    const driver = new BkashPaymentDriver();
    const body = Buffer.from(
      JSON.stringify({ paymentID: 'TR0011abc', status: 'success', merchantReference: 'inv-1' }),
    );
    expect(driver.callbackReference(body)).toBe('inv-1');
    const callback = driver.verifyCallback(body, {}, shop);
    expect(callback).toEqual({
      eventId: expect.stringMatching(/^bkash:[0-9a-f]{12}:TR0011abc:success$/),
      merchantReference: 'inv-1',
    });
    const other = driver.verifyCallback(
      body,
      {},
      { ...shop, credentials: Buffer.from(JSON.stringify({ ...credentials, appKey: 'other' })) },
    );
    expect(other!.eventId).not.toBe(callback!.eventId);
  });

  it('ignores a callback body it cannot read', () => {
    const driver = new BkashPaymentDriver();
    expect(driver.callbackReference(Buffer.from('not json'))).toBeUndefined();
    expect(driver.verifyCallback(Buffer.from('{}'), {}, shop)).toBeUndefined();
  });
});
