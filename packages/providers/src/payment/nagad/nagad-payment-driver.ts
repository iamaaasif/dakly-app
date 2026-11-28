import {
  constants,
  createHash,
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
  privateDecrypt,
  publicEncrypt,
  randomBytes,
  type KeyObject,
} from 'node:crypto';

import { z } from 'zod';

import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentCallback,
  PaymentDriver,
  PaymentMerchant,
  PaymentStatus,
} from '../payment-driver';

const BASE_URLS = {
  live: 'https://api.mynagad.com/api/dfs',
  sandbox: 'http://sandbox.mynagad.com:10080/remote-payment-gateway-1.0/api/dfs',
} as const;

const BDT_CURRENCY_CODE = '050';
// Nagad asks for the caller's address but only checks that the header is present.
const SERVER_ADDRESS = '127.0.0.1';
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;

// Keys are pasted from the Nagad merchant panel, either as PEM or as bare base64.
export const nagadCredentialsSchema = z.strictObject({
  merchantId: z.string().min(1),
  merchantPrivateKey: z.string().min(1),
  nagadPublicKey: z.string().min(1),
});
export type NagadCredentials = z.infer<typeof nagadCredentialsSchema>;

export type NagadBillingAccount = { mode: 'live' | 'sandbox'; credentials: NagadCredentials };

type NagadAccount = {
  mode: 'live' | 'sandbox';
  merchantId: string;
  privateKey: KeyObject;
  nagadKey: KeyObject;
};

const envelopeSchema = z.object({ sensitiveData: z.string(), signature: z.string() });
const initializedSchema = z.object({
  paymentReferenceId: z.string().min(1),
  challenge: z.string().min(1),
});
const completeReplySchema = z.object({
  status: z.string().optional(),
  callBackUrl: z.string().optional(),
});
const verifyReplySchema = z.object({
  merchantId: z.string().optional(),
  orderId: z.string().optional(),
  paymentRefId: z.string().optional(),
  amount: z.string().optional(),
  issuerPaymentRefNo: z.string().nullish(),
  status: z.string().optional(),
});
// Nagad returns the browser to the callback URL; the web layer forwards these fields as JSON.
const callbackBodySchema = z.object({
  paymentRefId: z.string().min(1),
  status: z.string().min(1),
  merchantReference: z.string().min(1),
});

export class NagadPaymentDriver implements PaymentDriver {
  readonly gateway = 'nagad';
  // Nagad does not sign its redirect, so no header is part of the callback identity.
  readonly callbackHeaders = [] as const;

  constructor(
    private readonly options: { billing?: NagadBillingAccount; now?: () => number } = {},
    private readonly request: typeof fetch = fetch,
  ) {}

  async createPayment(
    input: CreatePaymentInput,
    merchant: PaymentMerchant,
  ): Promise<CreatePaymentResult> {
    const account = this.account(merchant);
    const challenge = randomBytes(20).toString('hex');
    const initialised = initializedSchema.safeParse(
      await this.signedCall(
        account,
        `check-out/initialize/${account.merchantId}/${encodeURIComponent(input.orderReference)}`,
        {
          merchantId: account.merchantId,
          datetime: this.dhakaTimestamp(),
          orderId: input.orderReference,
          challenge,
        },
      ),
    );
    if (!initialised.success) throw gatewayError('Nagad did not start the payment');
    // Nagad must hand our challenge back, or the reply is not an answer to this request.
    if (initialised.data.challenge !== challenge) throw gatewayError('Nagad reply did not match');

    const reply = completeReplySchema.parse(
      await this.signedCall(
        account,
        `check-out/complete/${initialised.data.paymentReferenceId}`,
        {
          merchantId: account.merchantId,
          orderId: input.orderReference,
          currencyCode: BDT_CURRENCY_CODE,
          amount: formatTaka(input.amountPoisha),
          challenge: initialised.data.challenge,
        },
        { merchantCallbackURL: input.callbackUrl },
      ),
    );
    if (reply.status !== 'Success' || !reply.callBackUrl)
      throw gatewayError('Nagad did not create the payment page');
    return {
      gatewayPaymentId: initialised.data.paymentReferenceId,
      redirectUrl: reply.callBackUrl,
    };
  }

  async getStatus(gatewayPaymentId: string, merchant: PaymentMerchant): Promise<PaymentStatus> {
    const account = this.account(merchant);
    const reply = verifyReplySchema.parse(
      await this.send(
        account.mode,
        `verify/payment/${encodeURIComponent(gatewayPaymentId)}`,
        'GET',
      ),
    );
    if (reply.merchantId !== undefined && reply.merchantId !== account.merchantId)
      return { status: 'failed' };
    if (reply.status === 'Success') {
      const amountPoisha = reply.amount ? parseTakaToPoisha(reply.amount) : undefined;
      if (amountPoisha === undefined || !reply.orderId || !reply.issuerPaymentRefNo)
        throw gatewayError('Nagad payment details are incomplete');
      return {
        status: 'paid',
        amountPoisha,
        currency: 'BDT',
        merchantReference: reply.orderId,
        transactionId: reply.issuerPaymentRefNo,
      };
    }
    return { status: unpaidStatus(reply.status) };
  }

  callbackReference(rawBody: Buffer): string | undefined {
    return parseCallback(rawBody)?.merchantReference;
  }

  verifyCallback(
    rawBody: Buffer,
    _headers: Readonly<Record<string, string | string[] | undefined>>,
    merchant: PaymentMerchant,
  ): PaymentCallback | undefined {
    const callback = parseCallback(rawBody);
    if (!callback) return;
    const account = this.account(merchant);
    // Payment ids repeat across merchant accounts, so the event id carries the account.
    const namespace = createHash('sha256').update(account.merchantId).digest('hex').slice(0, 12);
    return {
      eventId: `nagad:${namespace}:${callback.paymentRefId}:${callback.status}`,
      merchantReference: callback.merchantReference,
    };
  }

  private account(merchant: PaymentMerchant): NagadAccount {
    if (merchant.flow === 'billing') {
      if (!this.options.billing) throw gatewayError('Nagad billing account is not configured');
      return buildAccount(this.options.billing.mode, this.options.billing.credentials);
    }
    const credentials = nagadCredentialsSchema.safeParse(
      parseJson(merchant.credentials.toString('utf8')),
    );
    if (!credentials.success) throw gatewayError('Nagad credentials are not valid');
    return buildAccount(merchant.mode, credentials.data);
  }

  // Both directions are encrypted to the receiver and signed by the sender.
  private async signedCall(
    account: NagadAccount,
    path: string,
    sensitive: Record<string, string>,
    extra: Record<string, string> = {},
  ): Promise<unknown> {
    const plain = Buffer.from(JSON.stringify(sensitive));
    const signature = createSign('RSA-SHA256').update(plain).sign(account.privateKey, 'base64');
    const reply = envelopeSchema.safeParse(
      await this.send(account.mode, path, 'POST', {
        dateTime: sensitive.datetime ?? this.dhakaTimestamp(),
        sensitiveData: publicEncrypt(
          { key: account.nagadKey, padding: constants.RSA_PKCS1_PADDING },
          plain,
        ).toString('base64'),
        signature,
        ...extra,
      }),
    );
    if (!reply.success) throw gatewayError('Nagad reply was not understood');
    const decrypted = decryptPkcs1(
      account.privateKey,
      Buffer.from(reply.data.sensitiveData, 'base64'),
    );
    const verified =
      decrypted !== undefined &&
      createVerify('RSA-SHA256')
        .update(decrypted)
        .verify(account.nagadKey, Buffer.from(reply.data.signature, 'base64'));
    if (!verified) throw gatewayError('Nagad reply signature is not valid');
    return parseJson(decrypted.toString('utf8'));
  }

  private async send(
    mode: 'live' | 'sandbox',
    path: string,
    method: 'GET' | 'POST',
    body?: Record<string, string>,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await this.request(`${BASE_URLS[mode]}/${path}`, {
        method,
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          'x-km-api-version': 'v-0.2.0',
          'x-km-ip-v4': SERVER_ADDRESS,
          'x-km-client-type': 'PC_WEB',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10_000),
        redirect: 'error',
      });
    } catch {
      throw gatewayError('Nagad did not answer');
    }
    if (!response.ok) throw gatewayError(`Nagad answered ${response.status}`);
    return response.json();
  }

  // Nagad reads the time as Asia/Dhaka wall clock, which has no daylight saving.
  private dhakaTimestamp(): string {
    const dhaka = new Date((this.options.now ?? Date.now)() + DHAKA_OFFSET_MS);
    return dhaka.toISOString().replace(/\D/g, '').slice(0, 14);
  }
}

function buildAccount(mode: 'live' | 'sandbox', credentials: NagadCredentials): NagadAccount {
  try {
    return {
      mode,
      merchantId: credentials.merchantId,
      privateKey: createPrivateKey(pem(credentials.merchantPrivateKey, 'PRIVATE KEY')),
      nagadKey: createPublicKey(pem(credentials.nagadPublicKey, 'PUBLIC KEY')),
    };
  } catch {
    throw gatewayError('Nagad keys are not valid');
  }
}

function pem(key: string, label: 'PRIVATE KEY' | 'PUBLIC KEY'): string {
  const trimmed = key.trim();
  if (trimmed.startsWith('-----BEGIN')) return trimmed;
  const lines = trimmed.replace(/\s+/g, '').match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`;
}

// Nagad encrypts with PKCS#1 v1.5, which Node refuses for private-key decryption since
// CVE-2023-46809. Decrypt raw and strip the padding here; the reply is then signature-checked.
function decryptPkcs1(privateKey: KeyObject, data: Buffer): Buffer | undefined {
  let raw: Buffer;
  try {
    raw = privateDecrypt({ key: privateKey, padding: constants.RSA_NO_PADDING }, data);
  } catch {
    return;
  }
  if (raw[0] !== 0x00 || raw[1] !== 0x02) return;
  const separator = raw.indexOf(0x00, 2);
  if (separator < 10) return;
  return raw.subarray(separator + 1);
}

function formatTaka(amountPoisha: number): string {
  const whole = Math.trunc(amountPoisha / 100);
  const fraction = String(amountPoisha % 100).padStart(2, '0');
  return `${whole}.${fraction}`;
}

function parseTakaToPoisha(amount: string): number | undefined {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount);
  if (!match) return;
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

function unpaidStatus(status: string | undefined): 'pending' | 'failed' | 'cancelled' {
  if (status === 'Aborted' || status === 'Cancelled') return 'cancelled';
  if (status === 'Failed' || status === 'Fail' || status === 'Invalid_Request') return 'failed';
  return 'pending';
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function parseCallback(rawBody: Buffer) {
  const parsed = callbackBodySchema.safeParse(parseJson(rawBody.toString('utf8')));
  return parsed.success ? parsed.data : undefined;
}

function gatewayError(message: string) {
  return Object.assign(new Error(message), { code: 'PAYMENT_GATEWAY_FAILED' });
}
