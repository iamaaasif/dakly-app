import { describe, expect, it } from 'vitest';

import { dropUnmappedFields, guessImportMapping } from './import-fields';

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
