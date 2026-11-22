import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import { poishaToTakaText } from '@dakly/contracts/money';
import type { ProductExportQuery } from '@dakly/contracts/product-imports';
import type { ProductResponse } from '@dakly/contracts/products';

import { AuditService } from '../audit/audit.service';
import { Clock } from '../platform/clock';
import { csvCell } from '../platform/csv-cell';
import { StoreTransaction } from '../platform/database/store-transaction';
import { ProductsService } from './products.service';

type Actor = Extract<AuditEntry['actor'], { kind: 'user' }>;

const PAGE_SIZE = 100;
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const CSV_TYPE = 'text/csv; charset=utf-8';
const FIELD_HEADERS = [
  'Name',
  'Price',
  'Category',
  'Description',
  'Status',
  'SKU',
  'Cost',
  'On hand',
] as const;

// One row per variant, with the columns the product import reads, so an exported file edited in
// a spreadsheet can be imported again. Option columns are named after the options themselves.
@Injectable()
export class ProductExportService {
  constructor(
    @Inject(ProductsService) private readonly products: ProductsService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async export(storeId: string, query: ProductExportQuery, actor: Actor) {
    const { format, ...filter } = query;
    const products = await this.readAll(storeId, filter);
    const optionNames = [
      ...new Set(products.flatMap(({ options }) => options.map(({ name }) => name))),
    ];
    const rows = [
      [...FIELD_HEADERS, ...optionNames],
      ...products.flatMap((product) => productRows(product, optionNames)),
    ];
    // A download of the catalogue is a record of who took it, so it is saved with its size.
    await this.transaction.run(storeId, () =>
      this.audit.record(storeId, {
        actor,
        action: 'products.exported',
        entityType: 'store',
        entityId: storeId,
        after: { state: `${rows.length - 1}_rows` },
      }),
    );
    const day = this.clock.now().toISOString().slice(0, 10);
    return {
      filename: `dakly-products-${day}.${format}`,
      type: format === 'csv' ? CSV_TYPE : XLSX_TYPE,
      body: format === 'csv' ? toCsv(rows) : await toXlsx(rows),
      rowCount: rows.length - 1,
    };
  }

  private async readAll(storeId: string, filter: Pick<ProductExportQuery, 'search' | 'readiness'>) {
    const products: ProductResponse[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.products.list(storeId, { ...filter, limit: PAGE_SIZE, cursor });
      products.push(...page.items);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return products;
  }
}

function productRows(product: ProductResponse, optionNames: string[]): string[][] {
  return product.variants.map((variant) => [
    product.name,
    poishaToTakaText(variant.pricePoisha),
    product.category ?? '',
    product.description ?? '',
    product.status,
    variant.sku ?? '',
    variant.costPoisha === null ? '' : poishaToTakaText(variant.costPoisha),
    // An untracked product has no count to bring back.
    product.isStockTracked ? String(variant.onHand) : '',
    ...optionNames.map((name) => variant.optionValues[name] ?? ''),
  ]);
}

function toCsv(rows: string[][]): string {
  // The byte order mark lets Excel read Bangla text as UTF-8.
  return `${BYTE_ORDER_MARK}${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

async function toXlsx(rows: string[][]): Promise<Buffer> {
  const sheet = rows.map((row, index) =>
    row.map((value) => (index === 0 ? { value, fontWeight: 'bold' as const } : { value })),
  );
  // The package ships as an ES module, which this CommonJS build can only load this way.
  const { default: writeXlsxFile } = await import('write-excel-file/node');
  return writeXlsxFile(sheet).toBuffer();
}
