import { describe, expect, it } from 'vitest';

import { dropUnmappedFields, guessImportMapping } from './import-fields';
import { IMPORT_PREVIEW_ROWS, readImportFile } from './import-file';

const bytes = (text: string) => new TextEncoder().encode(text).buffer;

describe('readImportFile', () => {
  it('reads quoted cells with commas, line breaks and doubled quotes', () => {
    const result = readImportFile(
      bytes('﻿Name,Phone\r\n"Uddin, Karim",01812345678\n"Say ""hi""\nthere",01712345678'),
    );
    expect(result).toEqual({
      header: ['Name', 'Phone'],
      rows: [
        ['Uddin, Karim', '01812345678'],
        ['Say "hi"\nthere', '01712345678'],
      ],
      rowCount: 2,
    });
  });

  it('skips blank lines and keeps only the first rows for the preview', () => {
    const lines = Array.from({ length: 30 }, (_, index) => `Rahima,0171234${1000 + index}`);
    const result = readImportFile(bytes(['Name,Phone', '', ...lines, ',', ''].join('\n')));
    expect(result).toMatchObject({ rowCount: 30 });
    expect(typeof result === 'object' && result.rows).toHaveLength(IMPORT_PREVIEW_ROWS);
  });

  it('refuses a file with a quote that never closes', () => {
    expect(readImportFile(bytes('Name,Phone\n"Rahima,01712345678\n'))).toBe(
      'This file could not be read as CSV. Look for a stray quote mark.',
    );
  });

  it('refuses a file with no customers or one that is not UTF-8', () => {
    expect(readImportFile(bytes('Name,Phone\n'))).toBe(
      'This file has no customers under its column names.',
    );
    expect(readImportFile(new Uint8Array([0xff, 0xfe, 0x4e, 0x00]).buffer)).toBe(
      'Save the file as CSV UTF-8 and choose it again.',
    );
  });
});

describe('import mapping', () => {
  it('matches common column names once each', () => {
    expect(
      guessImportMapping(['Customer Name', 'Mobile Number', 'E-mail', 'Area', 'Phone']),
    ).toEqual({ phone: 1, name: 0, email: 2, district: 3 });
  });

  it('drops fields left on do not import', () => {
    expect(dropUnmappedFields({ phone: 1, name: undefined, email: 0 })).toEqual({
      phone: 1,
      email: 0,
    });
  });
});
