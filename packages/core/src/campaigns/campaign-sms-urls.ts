type SmsUrl = { start: number; end: number; target: string };

const absoluteHttpUrl = /(?:^|(?<=\s))([[({<"'“‘]*)(https?:\/\/\S+)/giu;
const nonEmptyAuthority = /^https?:\/\/[^/?#]/iu;
const unsupportedUrlCharacter = /[<>\\]/u;
const sentencePunctuation = /[.,!?;:"'’”…।॥]+$/u;
const openingBracket: Partial<Record<string, string>> = { ')': '(', ']': '[', '}': '{' };

export function campaignSmsUrls(text: string): SmsUrl[] {
  const urls: SmsUrl[] = [];
  for (const match of text.matchAll(absoluteHttpUrl)) {
    const [, prefix, raw] = match;
    const start = match.index + prefix.length;
    const angleEnd = prefix.endsWith('<') ? raw.indexOf('>') : -1;
    const candidate = angleEnd < 0 ? trimMessagePunctuation(raw) : raw.slice(0, angleEnd);
    if (!nonEmptyAuthority.test(candidate) || unsupportedUrlCharacter.test(candidate)) continue;
    const parsed = URL.parse(candidate);
    if (parsed) urls.push({ start, end: start + candidate.length, target: parsed.href });
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

function trimMessagePunctuation(raw: string): string {
  let candidate = raw.replace(sentencePunctuation, '');
  for (let last = candidate.at(-1); last; last = candidate.at(-1)) {
    const opening = openingBracket[last];
    if (!opening || candidate.split(opening).length >= candidate.split(last).length) break;
    candidate = candidate.slice(0, -1).replace(sentencePunctuation, '');
  }
  return candidate;
}
