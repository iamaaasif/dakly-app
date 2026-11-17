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
  const header = records.next().value ?? [];
  const lines: { rowNumber: number; cells: string[] }[] = [];
  let rowNumber = 1;
  for (const cells of records) {
    rowNumber += 1;
    if (!cells.some((cell) => cell.trim())) continue;
    if (lines.length === MAX_IMPORT_ROWS) throw importError('IMPORT_FILE_TOO_MANY_ROWS');
    lines.push({ rowNumber, cells });
  }
  return { header, lines };
}

// RFC 4180 in one pass: a quoted cell may hold commas, line breaks and doubled quotes. Anything
// else, such as a stray quote inside a plain cell, makes the file unreadable rather than wrong.
function* csvRecords(text: string): Generator<string[], undefined> {
  let record: string[] = [];
  let position = 0;
  while (position < text.length) {
    const { cell, end } =
      text[position] === '"' ? quotedCell(text, position) : plainCell(text, position);
    if (record.length < MAX_IMPORT_COLUMNS) record.push(cell);
    position = end + 1;
    if (text[end] === ',') {
      if (position === text.length) record.push('');
      continue;
    }
    if (text[end] === '\r' && text[position] === '\n') position += 1;
    yield record;
    record = [];
  }
  if (record.length > 0) yield record;
  return undefined;
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
  let cell = '';
  let from = start + 1;
  for (;;) {
    const quote = text.indexOf('"', from);
    if (quote === -1) throw importError('IMPORT_FILE_UNREADABLE');
    cell += text.slice(from, quote);
    if (text[quote + 1] !== '"') {
      const end = quote + 1;
      if (end < text.length && !',\r\n'.includes(text[end]!))
        throw importError('IMPORT_FILE_UNREADABLE');
      return { cell, end };
    }
    cell += '"';
    from = quote + 2;
  }
}
