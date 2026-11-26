import type { ProductFormValues } from '@dakly/contracts/products';

export type GridOption = { name: string; values: string[] };
export type GridVariant = NonNullable<ProductFormValues['variants']>[number];

export const MAX_OPTIONS = 3;
export const MAX_VARIANTS = 100;

export const sizeSuggestions = ['S', 'M', 'L', 'XL', 'XXL'];
export const colourSuggestions = [
  'Black',
  'White',
  'Red',
  'Blue',
  'Green',
  'Grey',
  'Silver',
  'Navy',
  'Pink',
  'Brown',
  'Yellow',
];

export function optionNameKey(name: string) {
  const key = name.trim().toLowerCase();
  return key === 'colour' ? 'color' : key;
}

export function valueSuggestions(optionName: string): string[] {
  const name = optionNameKey(optionName);
  if (name === 'size') return ['XS', ...sizeSuggestions, 'XXXL'];
  if (name === 'material')
    return ['Cotton', 'Linen', 'Polyester', 'Wool', 'Silk', 'Denim', 'Leather'];
  return name === 'color' ? colourSuggestions : [];
}

// Rows keep their option values by option position, so renaming an option changes nothing.
function valueAt(variant: GridVariant, position: number): string | undefined {
  return variant.optionValues?.[position];
}

function combinationKey(variant: GridVariant, options: GridOption[]): string {
  return JSON.stringify(options.map((_, position) => valueAt(variant, position) ?? null));
}

function combinations(options: GridOption[]): string[][] {
  return options.reduce<string[][]>(
    (rows, option) =>
      option.values.length
        ? rows.flatMap((row) => option.values.map((value) => [...row, value]))
        : rows.map((row) => [...row, '']),
    [[]],
  );
}

function blankVariant(options: GridOption[], values: string[], like?: GridVariant): GridVariant {
  return {
    optionValues: Object.fromEntries(
      options.flatMap((_, position) => (values[position] ? [[position, values[position]]] : [])),
    ),
    sku: null,
    priceOverridePoisha: '',
    costPoisha: like?.costPoisha ?? '',
    lowStockThreshold: like?.lowStockThreshold ?? '',
    initialStock: 0,
  };
}

function sortRows(options: GridOption[], variants: GridVariant[]): GridVariant[] {
  const rank = (variant: GridVariant) =>
    options.map((option, position) => option.values.indexOf(valueAt(variant, position) ?? ''));
  return [...variants].sort((left, right) => {
    const [a, b] = [rank(left), rank(right)];
    const difference = a.findIndex((value, position) => value !== b[position]);
    return difference === -1 ? 0 : a[difference]! - b[difference]!;
  });
}

// Typing a value adds the rows it needs and nothing else: rows the seller removed stay removed,
// and a product that already has stock gives it to the first value of a new option.
export function applyOptions(
  previous: GridOption[],
  next: GridOption[],
  variants: GridVariant[],
): GridVariant[] {
  const kept = variants
    .map((variant) => ({
      ...variant,
      optionValues: {
        ...variant.optionValues,
        ...Object.fromEntries(
          next.flatMap((option, position) =>
            option.values.length && valueAt(variant, position) === undefined
              ? [[position, option.values[0]!]]
              : [],
          ),
        ),
      },
    }))
    .filter((variant) =>
      next.every(
        (option, position) =>
          !option.values.length || option.values.includes(valueAt(variant, position) ?? ''),
      ),
    );
  const present = new Set(kept.map((variant) => combinationKey(variant, next)));
  const isNew = (values: string[]) =>
    values.some((value, position) => value && !previous[position]?.values.includes(value));
  const added = combinations(next)
    .filter(
      (values) =>
        isNew(values) && !present.has(JSON.stringify(values.map((value) => value || null))),
    )
    .map((values) => blankVariant(next, values, kept[0] ?? variants[0]));
  return sortRows(next, [...kept, ...added]).slice(0, MAX_VARIANTS);
}

export function moveOption(
  options: GridOption[],
  variants: GridVariant[],
  { from, to }: { from: number; to: number },
) {
  const positions = options.map((_, position) => position);
  positions.splice(to, 0, positions.splice(from, 1)[0]!);
  const ordered = positions.map((position) => options[position]!);
  const rows = variants.map((variant) => ({
    ...variant,
    optionValues: Object.fromEntries(
      positions.flatMap((previous, position) => {
        const value = valueAt(variant, previous);
        return value === undefined ? [] : [[position, value]];
      }),
    ),
  }));
  return { options: ordered, variants: sortRows(ordered, rows) };
}

export function removeOptionAt(
  options: GridOption[],
  variants: GridVariant[],
  index: number,
): { options: GridOption[]; variants: GridVariant[] } {
  const remaining = options.filter((_, position) => position !== index);
  const seen = new Set<string>();
  const moved = variants
    .map((variant) => ({
      ...variant,
      optionValues: Object.fromEntries(
        Object.entries(variant.optionValues ?? {}).flatMap(([key, value]) => {
          const position = Number(key);
          return position === index ? [] : [[position > index ? position - 1 : position, value]];
        }),
      ),
    }))
    .filter((variant) => {
      const key = combinationKey(variant, remaining);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return { options: remaining, variants: sortRows(remaining, moved) };
}

export function missingCombinations(options: GridOption[], variants: GridVariant[]): number {
  const present = new Set(variants.map((variant) => combinationKey(variant, options)));
  return combinations(options).filter(
    (values) => !present.has(JSON.stringify(values.map((value) => value || null))),
  ).length;
}

export function addMissingCombinations(
  options: GridOption[],
  variants: GridVariant[],
): GridVariant[] {
  const present = new Set(variants.map((variant) => combinationKey(variant, options)));
  const added = combinations(options)
    .filter((values) => !present.has(JSON.stringify(values.map((value) => value || null))))
    .map((values) => blankVariant(options, values, variants[0]));
  return sortRows(options, [...variants, ...added]).slice(0, MAX_VARIANTS);
}

export function variantLabel(variant: GridVariant, options: GridOption[]): string {
  return options
    .map((_, position) => valueAt(variant, position))
    .filter(Boolean)
    .join(' / ');
}

export type VariantGroup = { label: string; rows: { variant: GridVariant; index: number }[] };

export function groupVariants(options: GridOption[], variants: GridVariant[]): VariantGroup[] {
  const groups = new Map<string, VariantGroup>();
  variants.forEach((variant, index) => {
    const label = valueAt(variant, 0) ?? '';
    const group = groups.get(label) ?? { label, rows: [] };
    group.rows.push({ variant, index });
    groups.set(label, group);
  });
  return options.length ? [...groups.values()] : [];
}

export function rowStock(variant: GridVariant): number {
  return Number(variant.initialStock) || 0;
}

function takaNumber(text: string | undefined): number | null {
  const value = Number((text ?? '').trim());
  return text?.trim() && Number.isFinite(value) ? value : null;
}

export function profitPercent(sellingPrice: string | undefined, cost: string | undefined) {
  const price = takaNumber(sellingPrice);
  const spent = takaNumber(cost);
  if (!price || spent === null) return null;
  return Math.round(((price - spent) / price) * 100);
}

export const pasteColumns: EditableField[] = [
  'priceOverridePoisha',
  'costPoisha',
  'initialStock',
  'sku',
];

// One cell is an ordinary paste; tabs or line breaks come from a spreadsheet and fill the grid.
export function parsePastedCells(text: string): string[][] | null {
  const lines = text.replace(/\r/g, '').replace(/\n$/, '').split('\n');
  if (lines.length === 1 && !lines[0]!.includes('\t')) return null;
  return lines.map((line) => line.split('\t').map((cell) => cell.trim()));
}

// Spreadsheets copy 1,200 or ৳1,200; the field takes 1200.
export function cleanPastedNumber(cell: string): string {
  return cell.replace(/[৳,\s]/g, '');
}

// Joins suggested values to an option with the same name, or adds the option while there is room.
export function withSuggestions(options: GridOption[], suggested: GridOption[]): GridOption[] {
  const next = options.map((option) => ({ ...option, values: [...option.values] }));
  for (const suggestion of suggested) {
    const key = optionNameKey(suggestion.name);
    const match = next.find((option) => optionNameKey(option.name) === key);
    if (match) {
      const known = new Set(match.values.map((value) => value.toLowerCase()));
      match.values.push(...suggestion.values.filter((value) => !known.has(value.toLowerCase())));
    } else if (next.length < MAX_OPTIONS) next.push({ ...suggestion });
  }
  return next;
}

export function rowKey(variant: GridVariant): string {
  return variant.id ?? `new:${JSON.stringify(variant.optionValues)}`;
}

export type EditableField = 'priceOverridePoisha' | 'costPoisha' | 'initialStock' | 'sku';
