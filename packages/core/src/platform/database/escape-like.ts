// Wrap the escaped text in wildcards only at the point where matching is intended.
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}
