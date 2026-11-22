import { describe, expect, it } from 'vitest';

import {
  applyOptions,
  groupVariants,
  profitPercent,
  removeOptionAt,
  type GridOption,
  type GridVariant,
} from './product-variant-grid';

function row(values: Record<number, string>, extra: Partial<GridVariant> = {}): GridVariant {
  return {
    optionValues: values,
    sku: null,
    priceOverridePoisha: '',
    costPoisha: '',
    initialStock: 0,
    ...extra,
  };
}
const size = (...values: string[]): GridOption => ({ name: 'Size', values });
const colour = (...values: string[]): GridOption => ({ name: 'Colour', values });

describe('building the variants grid', () => {
  it('gives the stock and code of a plain product to the first value of its first option', () => {
    const plain = row({}, { id: 'one', sku: 'PJ-1', initialStock: 12, costPoisha: '650' });
    const rows = applyOptions([], [size('S', 'M')], [plain]);
    expect(rows.map((variant) => variant.optionValues)).toEqual([{ 0: 'S' }, { 0: 'M' }]);
    expect(rows[0]).toMatchObject({ id: 'one', sku: 'PJ-1', initialStock: 12 });
    expect(rows[1]).toMatchObject({ sku: null, initialStock: 0, costPoisha: '650' });
  });

  it('adds only the rows a new value needs and keeps removed rows removed', () => {
    const before = [size('S', 'M'), colour('Black', 'White')];
    const rows = [
      row({ 0: 'S', 1: 'Black' }, { id: 'a' }),
      row({ 0: 'M', 1: 'Black' }, { id: 'b' }),
      row({ 0: 'M', 1: 'White' }, { id: 'c' }),
    ];
    const next = [size('S', 'M', 'L'), colour('Black', 'White')];
    const result = applyOptions(before, next, rows);
    expect(result.map(({ optionValues }) => Object.values(optionValues ?? {}).join('/'))).toEqual([
      'S/Black',
      'M/Black',
      'M/White',
      'L/Black',
      'L/White',
    ]);
  });

  it('drops the rows of a value that was removed', () => {
    const rows = [row({ 0: 'S' }, { id: 'a' }), row({ 0: 'M' }, { id: 'b' })];
    expect(applyOptions([size('S', 'M')], [size('M')], rows).map(({ id }) => id)).toEqual(['b']);
  });

  it('closes the gap in option positions when an option is removed', () => {
    const options = [size('S', 'M'), colour('Black')];
    const rows = [row({ 0: 'S', 1: 'Black' }), row({ 0: 'M', 1: 'Black' })];
    const result = removeOptionAt(options, rows, 0);
    expect(result.options.map(({ name }) => name)).toEqual(['Colour']);
    expect(result.variants).toHaveLength(1);
    expect(result.variants[0]?.optionValues).toEqual({ 0: 'Black' });
  });

  it('groups rows by the first option', () => {
    const options = [colour('Black', 'White'), size('S', 'M')];
    const rows = applyOptions([], options, [row({})]);
    expect(
      groupVariants(options, rows).map(({ label, rows: inGroup }) => [label, inGroup.length]),
    ).toEqual([
      ['Black', 2],
      ['White', 2],
    ]);
  });
});

describe('profit', () => {
  it('rounds profit as a share of the selling price', () => {
    expect(profitPercent('1200', '650')).toBe(46);
    expect(profitPercent('', '650')).toBeNull();
    expect(profitPercent('1200', '')).toBeNull();
  });
});
