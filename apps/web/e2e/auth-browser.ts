import { createHmac } from 'node:crypto';
import { expect, type Page } from '@playwright/test';

export async function privateInput(page: Page, name: string, value: string) {
  // Playwright fill step titles retain their argument, so credentials enter without that title.
  await page.evaluate(
    ({ name, value }) => {
      const input = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
      if (!input) throw new Error('The private input is not available');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { name, value },
  );
}

export async function scrubPage(page: Page) {
  if (page.isClosed()) return;
  await page
    .evaluate(() => {
      document.querySelectorAll('input').forEach((input) => {
        input.value = '';
      });
      document.querySelectorAll('[data-private]').forEach((element) => {
        element.textContent = '';
      });
      history.replaceState(null, '', location.pathname);
    })
    .catch(() => undefined);
}

export async function messageText(phone: string, match: RegExp, seen: Set<string>) {
  let text = '';
  await expect
    .poll(
      async () => {
        const recipient = `${phone}@sms.test`;
        const response = await fetch(
          `${process.env.MAILPIT_API_URL}/api/v1/search?query=${encodeURIComponent(`to:${recipient}`)}&limit=100`,
        );
        const found = (await response.json()) as { messages: { ID: string }[] };
        for (const item of found.messages) {
          if (seen.has(item.ID)) continue;
          const detail = await fetch(`${process.env.MAILPIT_API_URL}/api/v1/message/${item.ID}`);
          const message = (await detail.json()) as { Text: string; To: { Address: string }[] };
          if (
            message.To.length === 1 &&
            message.To[0]?.Address === recipient &&
            match.test(message.Text)
          ) {
            seen.add(item.ID);
            text = message.Text;
            return true;
          }
        }
        return false;
      },
      { timeout: 10000, message: 'Expected an owned Mailpit message' },
    )
    .toBe(true);
  return text;
}

export function authenticatorCode(uri: string) {
  const secret = new URL(uri).searchParams.get('secret')!;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...secret]
    .map((letter) => alphabet.indexOf(letter).toString(2).padStart(5, '0'))
    .join('');
  const key = Buffer.from(bits.match(/.{8}/g)!.map((byte) => Number.parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac('sha1', key).update(counter).digest();
  const offset = digest[digest.length - 1]! & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}
