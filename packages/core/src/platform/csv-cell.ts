// A cell starting with = + - or @ would run as a formula in a spreadsheet, so it gets a leading quote.
export function csvCell(value: unknown): string {
  const raw = typeof value === 'string' ? value : (JSON.stringify(value) ?? '');
  const safe = /^[\t\r\n ]*[=+@-]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}
