import {
  type ContactImportField,
  type ContactImportMapping,
  type ContactImportRow,
  contactImportRowSchema,
  MAX_IMPORT_ROWS,
} from '@dakly/contracts/contacts';

import { csvRecords } from './csv-records';
import { importError } from './imports.errors';

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
  if (bytes.some((byte) => byte < 32 && byte !== 9 && byte !== 10 && byte !== 13))
    throw importError('IMPORT_FILE_UNREADABLE');
  try {
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
