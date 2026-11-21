import { createHash } from 'node:crypto';

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
  live: 'https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized/checkout',
  sandbox: 'https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized/checkout',
} as const;

const SUCCESS_CODE = '0000';
// Refresh a minute early so a token never expires mid-request.
const TOKEN_MARGIN_MS = 60_000;

export const bkashCredentialsSchema = z.strictObject({
  appKey: z.string().min(1),
  appSecret: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
});
export type BkashCredentials = z.infer<typeof bkashCredentialsSchema>;

export type BkashBillingAccount = { mode: 'live' | 'sandbox'; credentials: BkashCredentials };

const tokenReplySchema = z.object({
  statusCode: z.string(),
  id_token: z.string().optional(),
  expires_in: z.number().optional(),
});
const createReplySchema = z.object({
  statusCode: z.string(),
  paymentID: z.string().optional(),
  bkashURL: z.string().optional(),
});
const paymentReplySchema = z.object({
  statusCode: z.string().optional(),
  transactionStatus: z.string().optional(),
  trxID: z.string().optional(),
  amount: z.string().optional(),
  currency: z.string().optional(),
  merchantInvoiceNumber: z.string().optional(),
});
// bKash returns the browser to the callback URL; the web layer forwards these fields as JSON.
const callbackBodySchema = z.object({
  paymentID: z.string().min(1),
  status: z.string().min(1),
  merchantReference: z.string().min(1),
});

export class BkashPaymentDriver implements PaymentDriver {
  readonly gateway = 'bkash';
  // bKash does not sign its redirect, so no header is part of the callback identity.
  readonly callbackHeaders = [] as const;
  private readonly tokens = new Map<string, { token: string; expiresAt: number }>();

  constructor(
    private readonly options: { billing?: BkashBillingAccount; now?: () => number } = {},
    private readonly request: typeof fetch = fetch,
  ) {}

  async createPayment(
    input: CreatePaymentInput,
    merchant: PaymentMerchant,
  ): Promise<CreatePaymentResult> {
    const account = this.account(merchant);
    const reply = createReplySchema.parse(
      await this.call(account, 'create', {
        mode: '0011',
        payerReference: input.orderReference,
        callbackURL: input.callbackUrl,
        amount: formatTaka(input.amountPoisha),
        currency: 'BDT',
        intent: 'sale',
        merchantInvoiceNumber: input.orderReference,
      }),
    );
    if (reply.statusCode !== SUCCESS_CODE || !reply.paymentID || !reply.bkashURL)
      throw gatewayError('bKash did not create the payment');
    return { gatewayPaymentId: reply.paymentID, redirectUrl: reply.bkashURL };
  }

  // Execute is what captures the money after the customer approves. It is safe to repeat: a
  // second call returns the first result, and a payment still waiting fails and falls to query.
  async getStatus(gatewayPaymentId: string, merchant: PaymentMerchant): Promise<PaymentStatus> {
    const account = this.account(merchant);
    await this.token(account);
    const executed = await this.tryCall(account, 'execute', { paymentID: gatewayPaymentId });
    const paid = paidStatus(executed);
    if (paid) return paid;
    const queried = paymentReplySchema.parse(
      await this.call(account, 'payment/status', { paymentID: gatewayPaymentId }),
    );
    const paidAfterQuery = paidStatus(queried);
    if (paidAfterQuery) return paidAfterQuery;
    return { status: unpaidStatus(queried.transactionStatus) };
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
    const namespace = createHash('sha256')
      .update(account.credentials.appKey)
      .digest('hex')
      .slice(0, 12);
    return {
      eventId: `bkash:${namespace}:${callback.paymentID}:${callback.status}`,
      merchantReference: callback.merchantReference,
    };
  }

  private account(merchant: PaymentMerchant): BkashBillingAccount {
    if (merchant.flow === 'billing') {
      if (!this.options.billing) throw gatewayError('bKash billing account is not configured');
      return this.options.billing;
    }
    const credentials = bkashCredentialsSchema.safeParse(
      parseJson(merchant.credentials.toString('utf8')),
    );
    if (!credentials.success) throw gatewayError('bKash credentials are not valid');
    return { mode: merchant.mode, credentials: credentials.data };
  }

  private async token(account: BkashBillingAccount): Promise<string> {
    const key = `${account.mode}:${account.credentials.appKey}`;
    const now = (this.options.now ?? Date.now)();
    const cached = this.tokens.get(key);
    if (cached && cached.expiresAt > now) return cached.token;
    const { appKey, appSecret, username, password } = account.credentials;
    const reply = tokenReplySchema.parse(
      await this.send(
        account.mode,
        'token/grant',
        { username, password },
        {
          app_key: appKey,
          app_secret: appSecret,
        },
      ),
    );
    if (reply.statusCode !== SUCCESS_CODE || !reply.id_token)
      throw gatewayError('bKash refused the credentials');
    const lifetimeMs = (reply.expires_in ?? 3600) * 1000;
    this.tokens.set(key, { token: reply.id_token, expiresAt: now + lifetimeMs - TOKEN_MARGIN_MS });
    return reply.id_token;
  }

  private async call(account: BkashBillingAccount, path: string, body: Record<string, string>) {
    const token = await this.token(account);
    return this.send(
      account.mode,
      path,
      { authorization: token, 'x-app-key': account.credentials.appKey },
      body,
    );
  }

  // An execute that errors or times out is not a verdict; the caller queries next.
  private async tryCall(account: BkashBillingAccount, path: string, body: Record<string, string>) {
    try {
      return paymentReplySchema.parse(await this.call(account, path, body));
    } catch {
      return undefined;
    }
  }

  private async send(
    mode: 'live' | 'sandbox',
    path: string,
    headers: Record<string, string>,
    body: Record<string, string>,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await this.request(`${BASE_URLS[mode]}/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
        redirect: 'error',
      });
    } catch {
      throw gatewayError('bKash did not answer');
    }
    if (!response.ok) throw gatewayError(`bKash answered ${response.status}`);
    return response.json();
  }
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

function paidStatus(
  reply: z.infer<typeof paymentReplySchema> | undefined,
): PaymentStatus | undefined {
  if (
    reply?.transactionStatus !== 'Completed' ||
    (reply.statusCode !== undefined && reply.statusCode !== SUCCESS_CODE) ||
    !reply.trxID ||
    !reply.currency ||
    !reply.merchantInvoiceNumber
  )
    return;
  const amountPoisha = reply.amount ? parseTakaToPoisha(reply.amount) : undefined;
  if (amountPoisha === undefined) return;
  return {
    status: 'paid',
    amountPoisha,
    currency: reply.currency,
    merchantReference: reply.merchantInvoiceNumber,
    transactionId: reply.trxID,
  };
}

function unpaidStatus(transactionStatus: string | undefined): 'pending' | 'failed' | 'cancelled' {
  if (transactionStatus === 'Cancelled') return 'cancelled';
  if (transactionStatus === 'Failed') return 'failed';
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
