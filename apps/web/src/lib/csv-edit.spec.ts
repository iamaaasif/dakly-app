import { describe, expect, it } from 'vitest';

import { applyCellEdits } from './csv-edit';

describe('applyCellEdits', () => {
  it('changes only the named cells, counting the header as row 1', () => {
    const csv = 'Name,Price\r\nKurti,abc\r\n\r\n"Cap, red",200\r\n';
    expect(
      applyCellEdits(csv, [
        { rowNumber: 2, column: 1, value: '1200' },
        { rowNumber: 4, column: 0, value: 'Cap "red"' },
      ]),
    ).toBe('Name,Price\r\nKurti,1200\r\n\r\n"Cap ""red""",200');
  });

  it('fills a short row up to the edited column', () => {
    expect(applyCellEdits('A,B,C\r\nx\r\n', [{ rowNumber: 2, column: 2, value: 'z' }])).toBe(
      'A,B,C\r\nx,,z',
    );
  });
});
