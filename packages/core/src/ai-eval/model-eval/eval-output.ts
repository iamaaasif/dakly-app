// The CLI's only output. Plain text tables, so a run can be pasted into a PR.
export function say(text: string) {
  console.log(text);
}

export function printTable(title: string, header: string[], rows: string[][]) {
  const widths = header.map((cell, column) =>
    Math.max(cell.length, ...rows.map((row) => (row[column] ?? '').length)),
  );
  const line = (row: string[]) =>
    row.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join('  ');
  say(`\n${title}\n${line(header)}\n${widths.map((width) => '-'.repeat(width)).join('  ')}`);
  for (const row of rows) say(line(row));
}

export const dollars = (microUsd: number) => `$${(microUsd / 1e6).toFixed(microUsd < 1e5 ? 4 : 3)}`;
