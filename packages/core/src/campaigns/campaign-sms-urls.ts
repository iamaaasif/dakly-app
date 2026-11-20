type SmsUrl = { start: number; end: number; target: string };

const absoluteHttpUrl = /(?:^|(?<=\s))([[({<"'“‘]*)https?:\/\/\S+/giu;
const nonEmptyAuthority = /^https?:\/\/[^/?#]/iu;
const unsupportedUrlCharacter = /[<>\\]/u;
const sentencePunctuation = /[.,!?;:"'’”…।॥]+$/u;
const trailingWrapperPunctuation = /^[)\]}.,!?;:"'’”…।॥]*$/u;
const closingWrapper: Partial<Record<string, string>> = {
  '<': '>',
  '"': '"',
  "'": "'",
  '“': '”',
  '‘': '’',
};
const openingBracket: Partial<Record<string, string>> = { ')': '(', ']': '[', '}': '{' };

export function campaignSmsUrls(text: string): SmsUrl[] {
  const urls: SmsUrl[] = [];
  for (const match of text.matchAll(absoluteHttpUrl)) {
    const prefix = match[1] ?? '';
    const raw = match[0].slice(prefix.length);
    const start = match.index + prefix.length;
    const candidate = urlCandidate(raw, prefix);
    if (
      !candidate ||
      !nonEmptyAuthority.test(candidate) ||
      unsupportedUrlCharacter.test(candidate)
    ) {
      continue;
    }
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

function urlCandidate(raw: string, prefix: string): string | undefined {
  const opener = prefix.at(-1) ?? '';
  const closer = closingWrapper[opener];
  if (!closer) return trimMessagePunctuation(raw);

  const delimiter = closer === '>' ? '>'.repeat(prefix.match(/<+$/u)?.[0].length ?? 1) : closer;
  const end = raw.lastIndexOf(delimiter);
  if (end < 0 || !trailingWrapperPunctuation.test(raw.slice(end + delimiter.length))) {
    return undefined;
  }
  const candidate = raw.slice(0, end);
  if (closer === '>') return candidate;
  if (isAmbiguousDoubleQuote(candidate, closer)) return undefined;
  return trimMessagePunctuation(candidate);
}

function isAmbiguousDoubleQuote(candidate: string, closer: string): boolean {
  if (closer === '”' && candidate.includes('“')) return true;
  if (closer !== '"' && closer !== '”') return false;
  const [location] = candidate.split(/[?#]/u, 1);
  return location?.includes(closer) ?? false;
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
