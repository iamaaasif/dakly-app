import {
  type ContactImportField,
  type ContactImportMapping,
  type ContactImportRow,
  contactImportRowSchema,
  MAX_IMPORT_COLUMNS,
} from '@dakly/contracts/contacts';

import { importError, MAX_IMPORT_ROWS } from './imports.errors';

// Row numbers are the ones the spreadsheet shows: the header is row 1. Messages never repeat
// the cell, because the report goes back to members who may not see full phones.
export type CustomerImportRowError = {
  rowNumber: number;
  field: ContactImportField;
  message: string;
};

export type CustomerImportRows = {
  rows: { rowNumber: number; contact: ContactImportRow }[];
  errors: CustomerImportRowError[];
};

// A file that is not valid UTF-8, such as UTF-16 from Excel, is refused rather than read as
// garbled text.
export function decodeCustomerImportFile(bytes: Uint8Array): string {
  try {
    if (bytes.some((byte) => byte < 32 && byte !== 9 && byte !== 10 && byte !== 13))
      throw importError('IMPORT_FILE_UNREADABLE');
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw importError('IMPORT_FILE_UNREADABLE');
  }
}

export function readCustomerImportRows(
  file: string,
  mapping: ContactImportMapping,
): CustomerImportRows {
  const { header, lines } = readLines(file);
  if (lines.length === 0) throw importError('IMPORT_FILE_EMPTY');
  if (Object.values(mapping).some((column) => column >= header.length))
    throw importError('IMPORT_COLUMN_MISSING');

  const result: CustomerImportRows = { rows: [], errors: [] };
  const seenPhones = new Set<string>();
  for (const { rowNumber, cells } of lines) {
    const parsed = contactImportRowSchema.safeParse(mappedCells(cells, mapping));
    if (!parsed.success) {
      result.errors.push(
        ...parsed.error.issues.map((issue) => ({
          rowNumber,
          field: issue.path[0] as ContactImportField,
          message: issue.message,
        })),
      );
    } else if (seenPhones.has(parsed.data.phone)) {
      result.errors.push({ rowNumber, field: 'phone', message: 'An earlier row has this phone' });
    } else {
      seenPhones.add(parsed.data.phone);
      const { whatsappPhone, ...contact } = parsed.data;
      // A WhatsApp number equal to the phone adds nothing: WhatsApp uses the phone by default.
      result.rows.push({
        rowNumber,
        contact: whatsappPhone === contact.phone ? contact : { ...contact, whatsappPhone },
      });
    }
  }
  return result;
}

// Feature 03: a cell with two phones keeps the first as the phone and the second as the
// WhatsApp number, unless the file has its own WhatsApp column filled in.
function mappedCells(cells: string[], mapping: ContactImportMapping): Record<string, string> {
  const mapped = Object.fromEntries(
    Object.entries(mapping).map(([field, column]) => [field, cells[column] ?? '']),
  );
  const [phone = '', secondPhone] = (mapped.phone ?? '').split(/[,;/]/);
  mapped.phone = phone;
  if (secondPhone && !mapped.whatsappPhone?.trim()) mapped.whatsappPhone = secondPhone;
  return mapped;
}

// Blank records are dropped as they are read and the count stops at the row limit, so a file of
// empty lines never builds a list of empty rows.
function readLines(file: string) {
  const records = csvRecords(file.replace(/^\uFEFF/, ''));
  const header = records.next().value?.cells ?? [];
  const lines: { rowNumber: number; cells: string[] }[] = [];
  for (const { rowNumber, cells, hasContent } of records) {
    if (!hasContent) continue;
    if (lines.length === MAX_IMPORT_ROWS) throw importError('IMPORT_FILE_TOO_MANY_ROWS');
    lines.push({ rowNumber, cells });
  }
  return { header, lines };
}

// RFC 4180 in one pass: a quoted cell may hold commas, line breaks and doubled quotes. Anything
// else, such as a stray quote inside a plain cell, makes the file unreadable rather than wrong.
// Lines with nothing on them are counted and skipped in a tight loop, so 10 MB of line breaks
// does not allocate a record each.
function* csvRecords(
  text: string,
): Generator<{ rowNumber: number; cells: string[]; hasContent: boolean }, undefined> {
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
      cells.push('');
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

// String concatenation and replacement allocate per escape on Node 22; one buffer bounds memory.
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
