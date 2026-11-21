import type { BotCheckDriver } from './bot-check-driver';

export class FakeBotCheckDriver implements BotCheckDriver {
  siteKey = null;
  async verify(token: string): Promise<boolean> {
    return token === 'fake-bot-check-pass';
  }
}
