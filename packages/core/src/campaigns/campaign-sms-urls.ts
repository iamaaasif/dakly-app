type SmsUrl = { start: number; end: number; target: string };

const absoluteHttpUrl = /(?:^|(?<=\s))([[({<"'“‘]*)https?:\/\/\S+/giu;
const nonEmptyAuthority = /^https?:\/\/[^/?#]/iu;
const unsupportedUrlCharacter = /[<>\\]/u;
const sentencePunctuation = /[.,!?;:"'’”…।॥]+$/u;
const trailingWrapperPunctuation = /^[)\]}.,!?;:"'’”…।॥]*$/u;
const followingQuote = /^[.,!?:;–—…।॥-]*["'‘“]/u;
const followingNestedQuote = /^[.,!?:;–—…।॥-]*[[({]*["'‘“]/u;
const followingBracketedQuote = /^[.,!?;–—…।॥-]+[[({]+["'‘“]/u;
const followingBracket = /^[.,!?;–—…।॥-]+[[({]/u;
const closingWrapper: Partial<Record<string, string>> = {
  '<': '>',
  '"': '"',
  "'": "'",
  '“': '”',
  '‘': '’',
};
const openingBracket: Readonly<Record<string, string>> = { ')': '(', ']': '[', '}': '{' };
const wrapperEnds: Partial<Record<string, string>> = {
  ...closingWrapper,
  '(': ')',
  '[': ']',
  '{': '}',
};

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
  if (!closer) return bareUrl(raw, prefix);

  const delimiter = closer === '>' ? '>'.repeat(prefix.match(/<+$/u)?.[0].length ?? 1) : closer;
  const end = raw.lastIndexOf(delimiter);
  if (end < 0 || !trailingWrapperPunctuation.test(raw.slice(end + delimiter.length))) {
    return undefined;
  }
  const candidate = raw.slice(0, end);
  if (closer === '>') return candidate;
  if (isAmbiguousQuote(candidate, prefix, closer)) return undefined;
  return trimMessagePunctuation(candidate);
}

function isAmbiguousQuote(candidate: string, prefix: string, closer: string): boolean {
  if (hasQuotedProse(candidate, prefix)) return true;
  if (closer === '”' && candidate.includes('“')) return true;
  if (closer !== '"' && closer !== '”') return false;
  const [location] = candidate.split(/[?#]/u, 1);
  return location?.includes(closer) ?? false;
}

function bareUrl(raw: string, prefix: string): string | undefined {
  if (!prefix) return trimMessagePunctuation(raw);
  const closingRun = matchingClosers(prefix);
  const bracketedProse = (following: string, end: number) =>
    followingBracket.test(following) && bracketsClosed(raw.slice(0, end), closingRun);
  if (hasAdjacentProse(raw, closingRun, bracketedProse)) return undefined;
  return trimMessagePunctuation(raw);
}

function hasQuotedProse(candidate: string, prefix: string): boolean {
  const brackets = bracketSpans(candidate);
  const closers = matchingClosers(prefix);
  for (let count = 1; count <= closers.length; count += 1) {
    const follows = (following: string, end: number) => {
      if (brackets.some(({ start, close }) => start < end && end < close)) return false;
      if (count > 1) return followingNestedQuote.test(following);
      return followingQuote.test(following) || followingBracketedQuote.test(following);
    };
    if (hasAdjacentProse(candidate, closers.slice(0, count), follows)) return true;
  }
  return false;
}

function matchingClosers(prefix: string): string {
  return [...prefix]
    .reverse()
    .map((opener) => wrapperEnds[opener])
    .join('');
}

function hasAdjacentProse(
  text: string,
  closingRun: string,
  follows: (following: string, end: number) => boolean,
): boolean {
  if (!closingRun) return false;
  for (let end = text.indexOf(closingRun); end >= 0; end = text.indexOf(closingRun, end + 1)) {
    if (follows(text.slice(end + closingRun.length), end)) return true;
  }
  return false;
}

function bracketsClosed(text: string, closingRun: string): boolean {
  for (const close of closingRun) {
    const open = openingBracket[close];
    if (open && text.split(open).length > text.split(close).length) return false;
  }
  return true;
}

function bracketSpans(text: string): { start: number; close: number }[] {
  const spans: { start: number; close: number }[] = [];
  for (const [closer, opener] of Object.entries(openingBracket)) {
    const starts: number[] = [];
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      if (character === opener) starts.push(index);
      if (character !== closer) continue;
      const start = starts.pop();
      if (start !== undefined) spans.push({ start, close: index });
    }
  }
  return spans;
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
