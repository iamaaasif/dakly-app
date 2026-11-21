import type { BotCheckDriver } from './bot-check-driver';

const SITE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export class TurnstileDriver implements BotCheckDriver {
  constructor(
    readonly siteKey: string,
    private readonly secretKey: string,
    private readonly send: typeof fetch = fetch,
  ) {}

  // A failed call to Cloudflare counts as a failed check: the buyer retries, nobody gets in unchecked.
  async verify(token: string, ip: string): Promise<boolean> {
    try {
      const response = await this.send(SITE_VERIFY_URL, {
        method: 'POST',
        body: new URLSearchParams({ secret: this.secretKey, response: token, remoteip: ip }),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return false;
      const result: unknown = await response.json();
      return typeof result === 'object' && result !== null && 'success' in result
        ? result.success === true
        : false;
    } catch {
      return false;
    }
  }
}
