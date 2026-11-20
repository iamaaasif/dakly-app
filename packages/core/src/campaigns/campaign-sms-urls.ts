type SmsUrl = { start: number; end: number; target: string };

const httpToken = /(?<!\S)([[(]?)https?:\/\/\S+/giu;
const sentencePunctuation = /[.,!?;:।]+$/u;

export function campaignSmsUrls(text: string): SmsUrl[] {
  const urls: SmsUrl[] = [];
  for (const match of text.matchAll(httpToken)) {
    const prefix = match[1] ?? '';
    const start = match.index + prefix.length;
    let url = match[0].slice(prefix.length).replace(sentencePunctuation, '');
    const close = url.at(-1);
    if (close === ')' || close === ']') {
      const open = close === ')' ? '(' : '[';
      if (url.split(close).length > url.split(open).length)
        url = url.slice(0, -1).replace(sentencePunctuation, '');
    }
    if (URL.canParse(url)) urls.push({ start, end: start + url.length, target: new URL(url).href });
  }
  return urls;
}

export function replaceCampaignSmsUrls(
  text: string,
  urls: SmsUrl[],
  replacement: (index: number) => string,
): string {
  let body = '';
  let cursor = 0;
  for (const [index, url] of urls.entries()) {
    body += text.slice(cursor, url.start) + replacement(index);
    cursor = url.end;
  }
  return body + text.slice(cursor);
}
