export function isoTime(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}
