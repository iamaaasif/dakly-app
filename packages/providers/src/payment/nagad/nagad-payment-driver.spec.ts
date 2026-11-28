import {
  constants,
  createSign,
  createVerify,
  generateKeyPairSync,
  privateDecrypt,
  publicEncrypt,
} from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { NagadPaymentDriver } from './nagad-payment-driver';

const keys = () => generateKeyPairSync('rsa', { modulusLength: 2048 });
const merchantKeys = keys();
const nagadKeys = keys();

const bare = (key: string) => key.replace(/-----[A-Z ]+-----|\s/g, '');
const credentials = {
  merchantId: '683002007104225',
  merchantPrivateKey: bare(
    merchantKeys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  ),
  nagadPublicKey: bare(nagadKeys.publicKey.export({ type: 'spki', format: 'pem' }).toString()),
};
const shop = {
  flow: 'shop',
  mode: 'sandbox',
  credentials: Buffer.from(JSON.stringify(credentials)),
} as const;

function reply(body: unknown, signer = nagadKeys.privateKey) {
  const plain = Buffer.from(JSON.stringify(body));
  return {
    sensitiveData: publicEncrypt(
      { key: merchantKeys.publicKey, padding: constants.RSA_PKCS1_PADDING },
      plain,
    ).toString('base64'),
    signature: createSign('RSA-SHA256').update(plain).sign(signer, 'base64'),
  };
}

function readMerchantRequest(sent: { sensitiveData: string; signature: string }) {
  const decrypted = privateDecrypt(
    { key: nagadKeys.privateKey, padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(sent.sensitiveData, 'base64'),
  );
  const signed = createVerify('RSA-SHA256')
    .update(decrypted)
    .verify(merchantKeys.publicKey, Buffer.from(sent.signature, 'base64'));
  return signed ? (JSON.parse(decrypted.toString('utf8')) as Record<string, string>) : undefined;
}

function answer(path: string, plain: Record<string, string>, options: FakeOptions) {
  if (path.startsWith('check-out/initialize/'))
    return reply(
      { paymentReferenceId: 'MDEx', challenge: plain.challenge },
      options.signer ?? nagadKeys.privateKey,
    );
  if (path.startsWith('check-out/complete/'))
    return reply({ status: 'Success', callBackUrl: 'https://sandbox.mynagad.com/pay/MDEx' });
  return options.verify;
}

type FakeOptions = { signer?: typeof nagadKeys.privateKey; verify?: unknown };

// A stand-in for Nagad: it decrypts what the driver sends and checks the merchant signature.
function fakeNagad(options: FakeOptions = {}) {
  const calls: { path: string; body: Record<string, string>; sent: unknown }[] = [];
  const request: typeof fetch = async (url, init) => {
    const path = new URL(String(url)).pathname.replace(/^.*\/api\/dfs\//, '');
    const sent = init?.body ? JSON.parse(String(init.body)) : undefined;
    const plain = sent ? readMerchantRequest(sent) : {};
    if (!plain) return new Response('bad signature', { status: 400 });
    calls.push({ path, body: plain, sent });
    return Response.json(answer(path, plain, options));
  };
  return { request, calls };
}

const input = {
  amountPoisha: 12005,
  orderReference: 'inv1',
  callbackUrl: 'https://api.dakly.test/cb',
};

describe('NagadPaymentDriver', () => {
  it('initialises, then completes the order and returns the payment page', async () => {
    const { request, calls } = fakeNagad();
    const result = await new NagadPaymentDriver(
      { now: () => Date.UTC(2026, 10, 28, 20, 5, 9) },
      request,
    ).createPayment(input, shop);
    expect(result).toEqual({
      gatewayPaymentId: 'MDEx',
      redirectUrl: 'https://sandbox.mynagad.com/pay/MDEx',
    });
    expect(calls.map((call) => call.path)).toEqual([
      'check-out/initialize/683002007104225/inv1',
      'check-out/complete/MDEx',
    ]);
    expect(calls[0]!.body).toMatchObject({ merchantId: '683002007104225', orderId: 'inv1' });
    // 20:05:09 UTC is 02:05:09 the next day in Dhaka.
    expect(calls[0]!.body.datetime).toBe('20261129020509');
    expect(calls[1]!.body).toMatchObject({
      currencyCode: '050',
      amount: '120.05',
      challenge: calls[0]!.body.challenge,
    });
    expect(calls[1]!.sent).toMatchObject({ merchantCallbackURL: 'https://api.dakly.test/cb' });
  });

  it('refuses a reply that Nagad did not sign', async () => {
    const { request } = fakeNagad({ signer: keys().privateKey });
    await expect(new NagadPaymentDriver({}, request).createPayment(input, shop)).rejects.toThrow(
      'Nagad reply signature is not valid',
    );
  });

  it('refuses stored keys that cannot be read', async () => {
    const broken = {
      flow: 'shop',
      mode: 'sandbox',
      credentials: Buffer.from(JSON.stringify({ ...credentials, merchantPrivateKey: 'abc' })),
    } as const;
    await expect(
      new NagadPaymentDriver({}, fakeNagad().request).createPayment(input, broken),
    ).rejects.toThrow('Nagad keys are not valid');
  });

  it('reports a verified success with the amount in poisha', async () => {
    const { request } = fakeNagad({
      verify: {
        merchantId: '683002007104225',
        orderId: 'inv1',
        amount: '120.05',
        issuerPaymentRefNo: 'TX9',
        status: 'Success',
      },
    });
    await expect(new NagadPaymentDriver({}, request).getStatus('MDEx', shop)).resolves.toEqual({
      status: 'paid',
      amountPoisha: 12005,
      currency: 'BDT',
      merchantReference: 'inv1',
      transactionId: 'TX9',
    });
  });

  it.each([
    ['Aborted', 'cancelled'],
    ['Failed', 'failed'],
    ['Pending', 'pending'],
  ])('maps Nagad status %s to %s', async (status, expected) => {
    const { request } = fakeNagad({ verify: { merchantId: '683002007104225', status } });
    await expect(new NagadPaymentDriver({}, request).getStatus('MDEx', shop)).resolves.toEqual({
      status: expected,
    });
  });

  it('does not accept a payment that belongs to another merchant', async () => {
    const { request } = fakeNagad({
      verify: {
        merchantId: '999',
        orderId: 'inv1',
        amount: '1',
        issuerPaymentRefNo: 'T',
        status: 'Success',
      },
    });
    await expect(new NagadPaymentDriver({}, request).getStatus('MDEx', shop)).resolves.toEqual({
      status: 'failed',
    });
  });

  it('reads the callback and namespaces the event id by merchant', () => {
    const driver = new NagadPaymentDriver();
    const body = Buffer.from(
      JSON.stringify({ paymentRefId: 'MDEx', status: 'Success', merchantReference: 'inv1' }),
    );
    expect(driver.callbackReference(body)).toBe('inv1');
    expect(driver.verifyCallback(body, {}, shop)).toMatchObject({
      merchantReference: 'inv1',
      eventId: expect.stringMatching(/^nagad:[0-9a-f]{12}:MDEx:Success$/),
    });
    expect(driver.verifyCallback(Buffer.from('nope'), {}, shop)).toBeUndefined();
  });

  it('needs a configured account for Dakly billing', async () => {
    await expect(
      new NagadPaymentDriver({}, fakeNagad().request).createPayment(input, { flow: 'billing' }),
    ).rejects.toThrow('Nagad billing account is not configured');
  });
});
