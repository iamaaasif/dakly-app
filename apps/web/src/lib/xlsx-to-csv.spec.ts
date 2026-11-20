import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { sheetToCsv, xlsxToCsvFile } from './xlsx-to-csv';

describe('sheetToCsv', () => {
  it('quotes cells with commas, quotes and line breaks and writes dates as ISO text', () => {
    expect(
      sheetToCsv([
        ['Name', 'Note', 'Joined'],
        [
          'Uddin, Karim',
          'say "hi"\nthere',
          new Date('2026-11-02T00:00:00Z') as unknown as typeof Date,
        ],
        [null, true, 'a\u0001b'],
      ]),
    ).toBe('Name,Note,Joined\r\n"Uddin, Karim","say ""hi""\nthere",2026-11-02\r\n,TRUE,a b');
  });
});

describe('xlsxToCsvFile', () => {
  it('turns the first sheet into a CSV file the import can read', async () => {
    const bytes = readFileSync(new URL('./fixtures/customers.xlsx', import.meta.url));
    const file = new File([bytes], 'customers.xlsx');
    const csv = await xlsxToCsvFile(file);
    expect(csv.name).toBe('customers.csv');
    expect(csv.type).toBe('text/csv');
    expect(await csv.text()).toBe(
      [
        'Name,Phone,Tags,Joined',
        'রহিমা আক্তার,1712345678,"eid, vip",2026-11-02',
        '"Uddin, Karim",01812345678,"say ""hi""",',
        ',,,',
        'Nusrat,1912345678,TRUE,',
      ].join('\r\n'),
    );
  });
});
