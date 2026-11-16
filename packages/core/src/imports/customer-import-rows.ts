import {
  type ContactImportField,
  type ContactImportMapping,
  type ContactImportRow,
  contactImportRowSchema,
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
  const [header = [], ...records] = parseCsv(file);
  const lines = records
    .map((cells, index) => ({ rowNumber: index + 2, cells }))
    .filter(({ cells }) => cells.some((cell) => cell.trim()));
  if (lines.length === 0) throw importError('IMPORT_FILE_EMPTY');
  if (lines.length > MAX_IMPORT_ROWS) throw importError('IMPORT_FILE_TOO_MANY_ROWS');
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

// RFC 4180: a quoted cell may hold commas, line breaks and doubled quotes. Anything else, such
// as a stray quote inside a plain cell, makes the file unreadable rather than silently wrong.
function parseCsv(file: string): string[][] {
  const text = file.replace(/^\uFEFF/, '');
  const cellPattern = /(?:"((?:[^"]|"")*)"|([^",\r\n]*))(,|\r\n|\n|\r|$)/y;
  const records: string[][] = [];
  let record: string[] = [];
  while (cellPattern.lastIndex < text.length) {
    const match = cellPattern.exec(text);
    if (!match) throw importError('IMPORT_FILE_UNREADABLE');
    const [, quoted, plain = '', end] = match;
    record.push(quoted === undefined ? plain : quoted.replaceAll('""', '"'));
    if (end !== ',') {
      records.push(record);
      record = [];
    }
  }
  if (record.length > 0) records.push([...record, '']);
  return records;
}
