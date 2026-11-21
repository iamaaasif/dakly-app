const signedOutPaths = ['/sign-in', '/sign-up', '/setup', '/invites'];
const placeholderOrigin = 'http://dakly.invalid';

// The value comes from a link anyone can craft, so only a plain path on this site is accepted.
export function safeNextPath(value: string | null | undefined): string | undefined {
  if (!value || value.length > 2000 || !value.startsWith('/')) return undefined;
  if (value.startsWith('//') || value.includes('\\') || hasControlCharacter(value))
    return undefined;
  const parsed = new URL(value, placeholderOrigin);
  if (parsed.origin !== placeholderOrigin) return undefined;
  const loops = signedOutPaths.some(
    (path) => parsed.pathname === path || parsed.pathname.startsWith(`${path}/`),
  );
  return loops ? undefined : `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function signInPath(next: string | null | undefined): string {
  const safe = safeNextPath(next);
  return safe ? `/sign-in?next=${encodeURIComponent(safe)}` : '/sign-in';
}

function hasControlCharacter(value: string) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}
