import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { contactImportMappingSchema, createImportSchema } from '@dakly/contracts/contacts';

import { decodeCustomerImportFile, readCustomerImportRows } from './customer-import-rows';

const header = 'Name,Mobile,WhatsApp,Email,Area,Tags';
const mapping = { name: 0, phone: 1, whatsappPhone: 2, email: 3, district: 4, tags: 5 };

describe('contactImportMappingSchema', () => {
  it('needs a phone column', () => {
    expect(contactImportMappingSchema.safeParse({ name: 0 }).success).toBe(false);
  });

  it('refuses one column for two fields', () => {
    expect(contactImportMappingSchema.safeParse({ phone: 1, whatsappPhone: 1 }).success).toBe(
      false,
    );
  });

  it('refuses a field it does not know', () => {
    expect(contactImportMappingSchema.safeParse({ phone: 1, storeId: 2 }).success).toBe(false);
  });
});

describe('createImportSchema', () => {
  it('refuses a file over 10 MB before an upload URL is signed', () => {
    expect(createImportSchema.safeParse({ sizeBytes: 10 * 1024 * 1024 }).success).toBe(true);
    expect(createImportSchema.safeParse({ sizeBytes: 10 * 1024 * 1024 + 1 }).success).toBe(false);
  });
});

describe('readCustomerImportRows', () => {
  it('rejects a quote-heavy oversized cell without exhausting a bulk worker', () => {
    const parser = fileURLToPath(new URL('./customer-import-rows.ts', import.meta.url));
    const script = `
      import(require('node:url').pathToFileURL(process.argv[1]).href).then(({ readCustomerImportRows }) => {
      const file = 'Name,Mobile\\n"' + '""'.repeat(5_000_000) + '",01712345678\\n';
      const result = readCustomerImportRows(file, { name: 0, phone: 1 });
      process.stdout.write(JSON.stringify({
        added: result.rows.length,
        field: result.errors[0]?.field,
        peakKiB: process.resourceUsage().maxRSS,
      }));
      });
    `;
    const loader = `export function resolve(name, context, next) {
      if (name.startsWith('.') && context.parentURL?.endsWith('.ts'))
        return next(name + '.ts', context);
      return next(name, context);
    }`;
    // A separate process makes the peak independent of other tests' allocations.
    const result = JSON.parse(
      execFileSync(
        process.execPath,
        [
          '--experimental-strip-types',
          '--loader',
          `data:text/javascript,${encodeURIComponent(loader)}`,
          '-e',
          script,
          parser,
        ],
        {
          encoding: 'utf8',
          timeout: 10000,
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      ),
    ) as { added: number; field: string; peakKiB: number };
    expect(result).toMatchObject({ added: 0, field: 'name' });
    expect(result.peakKiB).toBeLessThan(192 * 1024);
  });

  it('reports a missing mapped phone when only a later unmapped column has content', () => {
    const file = `Phone\n${','.repeat(200)}Rahima\n`;
    expect(readCustomerImportRows(file, { phone: 0 })).toMatchObject({
      rows: [],
      errors: [{ rowNumber: 2, field: 'phone' }],
    });
  });

  it('maps each field from its column and leaves blank cells unset', () => {
    const file = `${header}\r\nRahima Begum,01712345678,,rahima@example.com,Dhaka,"vip, eid"\r\n`;

    expect(readCustomerImportRows(file, mapping)).toEqual({
      rows: [
        {
          rowNumber: 2,
          contact: {
            name: 'Rahima Begum',
            phone: '01712345678',
            email: 'rahima@example.com',
            district: 'Dhaka',
            tags: ['vip', 'eid'],
          },
        },
      ],
      errors: [],
    });
  });

  it('chooses columns by position, so a repeated header reads the mapped one', () => {
    const file = 'Phone,Phone,Name\n01812345678,01712345678,Karim Uddin';

    const { rows } = readCustomerImportRows(file, { phone: 1, name: 2 });

    expect(rows[0]?.contact).toEqual({ phone: '01712345678', name: 'Karim Uddin' });
  });

  it('keeps Bangla and supplementary characters when decoding escaped quotes', () => {
    const file = 'Name,Mobile\n"নাসরিন ""\uD834\uDD1E"" বেগম",01712345678\n';
    expect(readCustomerImportRows(file, { name: 0, phone: 1 })).toMatchObject({
      rows: [
        { rowNumber: 2, contact: { name: 'নাসরিন "\uD834\uDD1E" বেগম', phone: '01712345678' } },
      ],
      errors: [],
    });
  });

  it('reads quoted cells with commas, line breaks and quotes, and a byte order mark', () => {
    const file = '\uFEFFName,Mobile,Notes\n"Sultana ""Shila"" Akter",01712345678,"Gate 2,\nRoad 5"';

    const { rows } = readCustomerImportRows(file, { name: 0, phone: 1, notes: 2 });

    expect(rows[0]?.contact).toEqual({
      name: 'Sultana "Shila" Akter',
      phone: '01712345678',
      notes: 'Gate 2,\nRoad 5',
    });
  });

  it('turns Bangla digits and +880 into the stored phone format', () => {
    const file = 'Mobile\n০১৭১২৩৪৫৬৭৮\n+880 1812-345678';

    const { rows } = readCustomerImportRows(file, { phone: 0 });

    expect(rows.map((row) => row.contact.phone)).toEqual(['01712345678', '01812345678']);
  });

  it('keeps the second phone in a cell as the WhatsApp number when it differs', () => {
    const file = 'Mobile,WhatsApp\n"01712345678, 01812345678",\n01912345678/01912345678,';

    const { rows } = readCustomerImportRows(file, { phone: 0, whatsappPhone: 1 });

    expect(rows.map((row) => row.contact)).toEqual([
      { phone: '01712345678', whatsappPhone: '01812345678' },
      { phone: '01912345678' },
    ]);
  });

  it('keeps a filled WhatsApp column over a second phone in the phone cell', () => {
    const file = 'Mobile,WhatsApp\n"01712345678, 01812345678",01612345678';

    const { rows } = readCustomerImportRows(file, { phone: 0, whatsappPhone: 1 });

    expect(rows[0]?.contact.whatsappPhone).toBe('01612345678');
  });

  it.each([
    ['a missing phone', 'Rahima Begum,,,,,', 'phone', 'Add a phone number'],
    ['a phone that is not a Bangladesh mobile', 'Rahima Begum,01212345678,,,,', 'phone'],
    ['a bad WhatsApp number', 'Rahima Begum,01712345678,12345,,,', 'whatsappPhone'],
    ['a bad email', 'Rahima Begum,01712345678,,rahima@,,', 'email'],
    ['a name over 120 letters', `${'ক'.repeat(121)},01712345678,,,,`, 'name'],
    ['a tag over 50 letters', `Rahima Begum,01712345678,,,,${'t'.repeat(51)}`, 'tags'],
  ])('reports %s with its row and field', (_case, line, field, message?: string) => {
    const file = `${header}\nKarim Uddin,01812345678,,,,\n${line}`;

    const { rows, errors } = readCustomerImportRows(file, mapping);

    expect(rows.map((row) => row.rowNumber)).toEqual([2]);
    expect(errors).toEqual([{ rowNumber: 3, field, message: message ?? expect.any(String) }]);
  });

  it('reports a phone repeated later in the file and keeps the first row', () => {
    const file = 'Name,Mobile\nRahima Begum,01712345678\nKarim Uddin,+8801712345678';

    const { rows, errors } = readCustomerImportRows(file, { name: 0, phone: 1 });

    expect(rows.map((row) => row.contact.name)).toEqual(['Rahima Begum']);
    expect(errors).toEqual([
      { rowNumber: 3, field: 'phone', message: 'An earlier row has this phone' },
    ]);
  });

  it('never puts the cell value in a row error', () => {
    const { errors } = readCustomerImportRows('Mobile\n0171234567', { phone: 0 });

    expect(errors[0]?.message).not.toContain('0171234567');
  });

  it('skips blank rows and keeps the spreadsheet row numbers', () => {
    const file = 'Mobile\n01712345678\n\n,\n01212345678\n';

    const { rows, errors } = readCustomerImportRows(file, { phone: 0 });

    expect(rows.map((row) => row.rowNumber)).toEqual([2]);
    expect(errors.map((error) => error.rowNumber)).toEqual([5]);
  });

  it.each([
    ['a stray quote', 'Mobile\n017"12345678', 'IMPORT_FILE_UNREADABLE'],
    ['a quote that never closes', 'Mobile\n"01712345678', 'IMPORT_FILE_UNREADABLE'],
    ['only a header', 'Mobile\n\n', 'IMPORT_FILE_EMPTY'],
    ['an empty file', '', 'IMPORT_FILE_EMPTY'],
  ])('refuses a file with %s', (_case, file, code) => {
    expect(() => readCustomerImportRows(file, { phone: 0 })).toThrow(
      expect.objectContaining({ code }),
    );
  });

  it('refuses a mapping that names a column the file does not have', () => {
    expect(() => readCustomerImportRows('Mobile\n01712345678', { phone: 0, name: 1 })).toThrow(
      expect.objectContaining({ code: 'IMPORT_COLUMN_MISSING' }),
    );
  });

  // These two read 10 MB for real, which takes a few seconds while the whole suite runs at once.
  it('reads a file of ten million empty lines as empty without keeping them', () => {
    const file = `Mobile${'\n'.repeat(10_000_000)}`;

    expect(() => readCustomerImportRows(file, { phone: 0 })).toThrow(
      expect.objectContaining({ code: 'IMPORT_FILE_EMPTY' }),
    );
  }, 30_000);

  it('refuses a quote that never closes over 10 MB of text', () => {
    const file = `Mobile\n"${'0'.repeat(10 * 1024 * 1024)}`;

    expect(() => readCustomerImportRows(file, { phone: 0 })).toThrow(
      expect.objectContaining({ code: 'IMPORT_FILE_UNREADABLE' }),
    );
  }, 30_000);

  it('keeps no cells past the last column a mapping can name', () => {
    const file = `Mobile${',x'.repeat(1_000)}\n01712345678${',y'.repeat(1_000)}`;

    expect(readCustomerImportRows(file, { phone: 0 }).rows).toHaveLength(1);
    expect(() => readCustomerImportRows(file, { phone: 0, name: 199 })).not.toThrow();
  });

  it('refuses more than 50,000 customer rows', () => {
    const file = `Mobile\n${'01712345678\n'.repeat(50_001)}`;

    expect(() => readCustomerImportRows(file, { phone: 0 })).toThrow(
      expect.objectContaining({ code: 'IMPORT_FILE_TOO_MANY_ROWS' }),
    );
  });
});

describe('decodeCustomerImportFile', () => {
  it.each([0, 1, 8, 11, 12, 14, 31])('refuses control byte %i before database writes', (byte) => {
    const bytes = new TextEncoder().encode(
      `Name,Mobile\nনাসরিন${String.fromCharCode(byte)},01712345678\n`,
    );
    expect(() => decodeCustomerImportFile(bytes)).toThrow(
      expect.objectContaining({ code: 'IMPORT_FILE_UNREADABLE' }),
    );
  });

  it('keeps tabs and CSV line breaks', () => {
    const file = 'Name,Mobile\r\nনাসরিন\tবেগম,01712345678\n';
    expect(decodeCustomerImportFile(new TextEncoder().encode(file))).toBe(file);
  });

  it('reads UTF-8 text, Bangla and a byte order mark included', () => {
    const bytes = new TextEncoder().encode('\uFEFFনাম,Mobile\n');

    expect(decodeCustomerImportFile(bytes)).toBe('নাম,Mobile\n');
  });

  it.each([
    ['a UTF-16 file without a byte order mark', Buffer.from('Mobile\n01712345678\n', 'utf16le')],
    ['a UTF-16 file', Buffer.from('\uFEFFMobile\n01712345678\n', 'utf16le')],
    ['a file with an invalid byte', Uint8Array.from([0x4d, 0x6f, 0xff, 0x0a])],
  ])('refuses %s as unreadable', (_case, bytes) => {
    expect(() => decodeCustomerImportFile(bytes)).toThrow(
      expect.objectContaining({ code: 'IMPORT_FILE_UNREADABLE' }),
    );
  });
});
