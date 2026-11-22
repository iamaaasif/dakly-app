import { describe, expect, it } from 'vitest';

import { productImportMappingSchema } from '@dakly/contracts/product-imports';

import { readProductImportRows } from './product-import-rows';

const mapping = productImportMappingSchema.parse({
  name: 0,
  price: 1,
  sku: 2,
  onHand: 3,
  category: 4,
  options: [{ name: 'Size', column: 5 }],
});
const header = 'Name,Price,SKU,Stock,Category,Size\r\n';

describe('readProductImportRows', () => {
  it('groups rows by product name into variants with their own sizes', () => {
    const { products, errors } = readProductImportRows(
      `${header}Panjabi,1250.50,P-M,4,Men,M\r\npanjabi,1250.50,P-L,,,L\r\nSandal,900,S-1,2,,M\r\n`,
      mapping,
    );
    expect(errors).toEqual([]);
    expect(products).toHaveLength(2);
    expect(products[0]).toMatchObject({
      name: 'Panjabi',
      category: 'Men',
      status: undefined,
      pricePoisha: 125050,
      options: [{ name: 'Size', values: ['M', 'L'] }],
    });
    expect(
      products[0]?.variants.map(({ sku, onHand, optionValues }) => [sku, onHand, optionValues]),
    ).toEqual([
      ['P-M', 4, { Size: 'M' }],
      ['P-L', undefined, { Size: 'L' }],
    ]);
  });

  it('stores a later row with a different price as that size price', () => {
    const { products, errors } = readProductImportRows(
      `${header}Panjabi,1000,P-M,,,M\r\nPanjabi,1200,P-XL,,,XL\r\nPanjabi,,P-L,,,L\r\n`,
      mapping,
    );
    expect(errors).toEqual([]);
    expect(products[0]?.pricePoisha).toBe(100000);
    expect(products[0]?.variants.map((variant) => variant.priceOverridePoisha)).toEqual([
      null,
      120000,
      null,
    ]);
  });

  it('reports bad cells with the spreadsheet row number and drops only those rows', () => {
    const { products, errors } = readProductImportRows(
      `${header}Panjabi,12.345,P-M,,,M\r\nShirt,500,S-1,-2,,M\r\nShirt,500,S-2,3,,\r\nCap,100,C-1,1,,M\r\n`,
      mapping,
    );
    expect(errors).toEqual([
      { rowNumber: 2, field: 'price', message: 'Enter Taka with at most two decimal places' },
      { rowNumber: 3, field: 'onHand', message: 'Enter a whole number' },
    ]);
    expect(products.map(({ name }) => name)).toEqual(['Shirt', 'Cap']);
  });

  it('reads a row with every option blank as a product without options', () => {
    const { products, errors } = readProductImportRows(
      `${header}Scarf,450,,,,\r\nShirt,500,S-1,,,M\r\nShirt,500,S-2,,,\r\n`,
      mapping,
    );
    expect(products[0]).toMatchObject({ name: 'Scarf', options: [] });
    expect(products[1]?.variants).toHaveLength(1);
    expect(errors).toEqual([
      { rowNumber: 4, field: 'options', message: 'Rows of one product need the same options' },
    ]);
  });

  it('refuses a repeated sku, a repeated size and a changed category', () => {
    const { products, errors } = readProductImportRows(
      `${header}Panjabi,1000,P-M,,Men,M\r\nPanjabi,1000,P-M,,Men,L\r\nPanjabi,1000,P-X,,Men,m\r\nPanjabi,1000,P-L,,Kids,L\r\n`,
      mapping,
    );
    expect(errors.map(({ rowNumber, field }) => [rowNumber, field])).toEqual([
      [3, 'sku'],
      [4, 'options'],
      [5, 'category'],
    ]);
    expect(products[0]?.variants).toHaveLength(1);
  });

  it('keeps a product without options to one row and reads active or hidden status', () => {
    const plain = productImportMappingSchema.parse({ name: 0, price: 1, status: 2 });
    const { products, errors } = readProductImportRows(
      'Name,Price,Status\r\nTote,300,HIDDEN\r\nTote,300,\r\n',
      plain,
    );
    expect(errors).toEqual([
      { rowNumber: 3, field: 'name', message: 'A product without options has one row' },
    ]);
    expect(products[0]).toMatchObject({ status: 'hidden', options: [] });
    expect(readProductImportRows('Name,Price,Status\r\nTote,300,sold\r\n', plain).errors).toEqual([
      { rowNumber: 2, field: 'status', message: 'Use active or hidden' },
    ]);
  });

  it('refuses an empty file and a column the file does not have', () => {
    expect(() => readProductImportRows(header, mapping)).toThrow(
      expect.objectContaining({ code: 'IMPORT_FILE_EMPTY' }),
    );
    expect(() => readProductImportRows('Name,Price\r\nCap,100\r\n', mapping)).toThrow(
      expect.objectContaining({ code: 'IMPORT_COLUMN_MISSING' }),
    );
  });
});
