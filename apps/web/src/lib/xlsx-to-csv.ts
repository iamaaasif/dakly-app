import type { SheetData } from 'read-excel-file/browser';

type Cell = SheetData<string>[number][number];

// Excel shows these dates as the shop typed them; the import reads ISO text.
function cellText(cell: Cell): string {
  if (cell === null) return '';
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  if (typeof cell === 'boolean') return cell ? 'TRUE' : 'FALSE';
  // The server refuses control bytes other than tab, CR and LF.
  return Array.from(String(cell), (char) => {
    const code = char.charCodeAt(0);
    return code < 32 && code !== 9 && code !== 10 && code !== 13 ? ' ' : char;
  }).join('');
}

function csvCell(text: string): string {
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function sheetToCsv(rows: SheetData<string>): string {
  return rows.map((row) => row.map((cell) => csvCell(cellText(cell))).join(',')).join('\r\n');
}

// Only the first sheet is read. Numbers stay as the file spelled them, so a phone typed as a
// number reaches the import as digits. The library loads only when a shop picks an .xlsx file.
export async function xlsxToCsvFile(file: File): Promise<File> {
  const { readSheet } = await import('read-excel-file/browser');
  // The library types a date cell as the Date constructor, so it is read as the Date it is.
  const rows: SheetData<string> = await readSheet(file, { parseNumber: (text) => text });
  const name = file.name.replace(/\.xlsx$/i, '.csv');
  return new File([sheetToCsv(rows)], name, { type: 'text/csv' });
}
