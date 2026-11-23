import { MetaRequestError, type MediaDownload } from '../channel-driver';

// The webhook is signed, but the token only goes to Meta's own media hosts.
const mediaHostSuffixes = ['.fbcdn.net', '.cdninstagram.com', '.fbsbx.com'];

export function isMetaMediaUrl(url: string): boolean {
  const { protocol, hostname } = new URL(url);
  return protocol === 'https:' && mediaHostSuffixes.some((suffix) => hostname.endsWith(suffix));
}

// Meta's signed media links carry their expiry as hex Unix seconds in the `oe` parameter.
function linkExpired(url: string): boolean {
  const expiry = Number.parseInt(new URL(url).searchParams.get('oe') ?? '', 16);
  return Number.isFinite(expiry) && expiry * 1000 < Date.now();
}

// Returns a final answer for a failed fetch, throws for an uncertain one, or nothing on success.
export function failedMediaResult(response: Response, url: string): MediaDownload | undefined {
  const { status } = response;
  // The token must never follow a redirect, so a redirect is a final answer.
  if (status >= 300 && status < 400) throw new MetaRequestError('rejected');
  // A CDN answer says nothing certain about the Page token, so it never marks it rejected.
  if (status === 401) throw new MetaRequestError('rejected');
  if ([400, 404, 410].includes(status)) return { kind: 'expired' };
  // A 403 is only an expired link when the link's own expiry has passed; otherwise it may pass
  // on a retry, so it counts as a fetch failure.
  if (status === 403 && linkExpired(url)) return { kind: 'expired' };
  if (!response.ok) throw new MetaRequestError('unavailable');
  return undefined;
}

export function mediaType(response: Response): string {
  return (response.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? '';
}

// Content-Length can be missing or wrong, so the body is counted as it arrives.
export async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array | null> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for await (const chunk of response.body ?? []) {
      total += chunk.byteLength;
      if (total > maxBytes) return null;
      chunks.push(chunk);
    }
  } catch {
    throw new MetaRequestError('unavailable');
  }
  return Buffer.concat(chunks);
}
