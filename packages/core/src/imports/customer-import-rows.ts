import {
  type ContactImportField,
  type ContactImportMapping,
  type ContactImportRow,
  contactImportRowSchema,
} from '@dakly/contracts/contacts';

import { readCsvLines } from './csv-records';
import { importError } from './imports.errors';

export const FIELD_LABELS = {
  phone: 'Phone',
  name: 'Name',
  whatsappPhone: 'WhatsApp number',
  email: 'Email',
  address: 'Address',
  district: 'District',
  tags: 'Tags',
  notes: 'Notes',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
} as const satisfies Record<string, string>;

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
  const { header, lines } = readCsvLines(file);
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
