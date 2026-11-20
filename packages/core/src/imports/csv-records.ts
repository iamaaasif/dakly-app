import { MAX_IMPORT_COLUMNS, MAX_IMPORT_ROWS } from '@dakly/contracts/contacts';

import { importError } from './imports.errors';

// RFC 4180 in one pass: a quoted cell may hold commas, line breaks and doubled quotes. Anything
// else, such as a stray quote inside a plain cell, makes the file unreadable rather than wrong.
// Lines with nothing on them are counted and skipped in a tight loop, so 10 MB of line breaks
// does not allocate a record each.
export function* csvRecords(
  file: string,
): Generator<{ rowNumber: number; cells: string[]; hasContent: boolean }, undefined> {
  const text = file.replace(/^\uFEFF/, '');
  let position = 0;
  let rowNumber = 0;
  for (;;) {
    const blank = skipBlankLines(text, position);
    if (blank.position >= text.length) return undefined;
    const { cells, next, hasContent } = readRecord(text, blank.position);
    position = next;
    rowNumber += blank.lines + 1;
    yield { rowNumber, cells, hasContent };
  }
}

function skipBlankLines(text: string, start: number) {
  let position = start;
  let lines = 0;
  while (text[position] === '\n' || text[position] === '\r') {
    position += text[position] === '\r' && text[position + 1] === '\n' ? 2 : 1;
    lines += 1;
  }
  return { position, lines };
}

function readRecord(text: string, start: number) {
  const cells: string[] = [];
  let hasContent = false;
  let position = start;
  for (;;) {
    const { cell, end } =
      text[position] === '"' ? quotedCell(text, position) : plainCell(text, position);
    hasContent ||= cell.trim().length > 0;
    if (cells.length < MAX_IMPORT_COLUMNS) cells.push(cell);
    position = end + 1;
    if (text[end] !== ',') break;
    if (position >= text.length) {
      if (cells.length < MAX_IMPORT_COLUMNS) cells.push('');
      break;
    }
  }
  const crlf = text[position - 1] === '\r' && text[position] === '\n';
  return { cells, hasContent, next: crlf ? position + 1 : position };
}

// `end` is the index of the separator after the cell, or the text length.
function plainCell(text: string, start: number) {
  let end = start;
  while (end < text.length && !',\r\n'.includes(text[end]!)) {
    if (text[end] === '"') throw importError('IMPORT_FILE_UNREADABLE');
    end += 1;
  }
  return { cell: text.slice(start, end), end };
}

function quotedCell(text: string, start: number) {
  let from = start + 1;
  let escaped = 0;
  for (;;) {
    const quote = text.indexOf('"', from);
    if (quote === -1) throw importError('IMPORT_FILE_UNREADABLE');
    if (text[quote + 1] !== '"') {
      const end = quote + 1;
      if (end < text.length && !',\r\n'.includes(text[end]!))
        throw importError('IMPORT_FILE_UNREADABLE');
      return { cell: decodeQuotedCell(text, start + 1, quote, escaped), end };
    }
    escaped += 1;
    from = quote + 2;
  }
}

// Node 22.23.4 slice/replaceAll peaks at 304,200 KiB RSS for the quote-heavy 10 MB case.
// One buffer keeps decoding below the 192 MiB regression limit without per-escape strings.
function decodeQuotedCell(text: string, start: number, end: number, escaped: number): string {
  if (escaped === 0) return text.slice(start, end);
  const bytes = Buffer.allocUnsafe((end - start - escaped) * 2);
  let offset = 0;
  for (let index = start; index < end; index += 1) {
    const value = text.charCodeAt(index);
    bytes.writeUInt16LE(value, offset);
    offset += 2;
    if (value === 34) index += 1;
  }
  return bytes.toString('utf16le');
}

// Blank records are dropped as they are read and the count stops at the row limit, so a file of
// empty lines never builds a list of empty rows.
export function readCsvLines(file: string) {
  const records = csvRecords(file);
  const header = records.next().value?.cells ?? [];
  const lines: { rowNumber: number; cells: string[] }[] = [];
  for (const { rowNumber, cells, hasContent } of records) {
    if (!hasContent) continue;
    if (lines.length === MAX_IMPORT_ROWS) throw importError('IMPORT_FILE_TOO_MANY_ROWS');
    lines.push({ rowNumber, cells });
  }
  return { header, lines };
}

// A file that is not valid UTF-8, such as UTF-16 from Excel, is refused rather than read as
// garbled text.
export function decodeCsvFile(bytes: Uint8Array): string {
  if (bytes.some((byte) => byte < 32 && byte !== 9 && byte !== 10 && byte !== 13))
    throw importError('IMPORT_FILE_UNREADABLE');
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw importError('IMPORT_FILE_UNREADABLE');
  }
}
