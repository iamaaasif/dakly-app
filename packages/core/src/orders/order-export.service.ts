import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import { poishaToTakaText } from '@dakly/contracts/money';
import { orderStageLabels, type OrderExportQuery } from '@dakly/contracts/orders';
import { maskPhone } from '@dakly/contracts/phone';
import type { StoreAccess } from '@dakly/contracts/team';

import { AuditService } from '../audit/audit.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import {
  CSV_TYPE,
  MAX_EXPORT_ROWS,
  spreadsheetCsv,
  spreadsheetXlsx,
  XLSX_TYPE,
} from '../platform/spreadsheet';
import { StoresService } from '../stores/stores.service';
import { OrderExportRepository, type OrderExportRow } from './order-export.repository';
import { orderListMatch } from './order-list-match';
import { orderError } from './orders.errors';

type Access = Pick<StoreAccess, 'exportLists' | 'seeFullPhone'>;
type Actor = Extract<AuditEntry['actor'], { kind: 'user' }>;

const columns = [
  'Order number',
  'Order date',
  'Stage',
  'Buyer',
  'Recipient',
  'Phone',
  'District',
  'Product',
  'Variant',
  'Quantity',
  'Unit price',
  'Line discount',
  'Delivery charge',
  'Order discount',
  'Advance',
  'COD to collect',
] as const;

@Injectable()
export class OrderExportService {
  constructor(
    @Inject(OrderExportRepository) private readonly repository: OrderExportRepository,
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async export(
    storeId: string,
    { format, ...filters }: OrderExportQuery,
    access: Access,
    actor: Actor,
  ) {
    if (!access.exportLists) throw orderError('ORDER_EXPORT_NOT_ALLOWED');
    const timeZone = await this.stores.timeZone(storeId);
    const now = this.clock.now();
    const match = orderListMatch(filters, { timeZone, now, seeFullPhone: access.seeFullPhone });
    const lines = await this.repository.listLines(storeId, match, MAX_EXPORT_ROWS + 1);
    if (lines.length > MAX_EXPORT_ROWS) throw orderError('ORDER_EXPORT_TOO_LARGE');

    const calendarDay = new Intl.DateTimeFormat('sv-SE', { timeZone, dateStyle: 'short' });
    const rows = [
      columns,
      ...lines.map((line) => orderExportCells(line, calendarDay, access.seeFullPhone)),
    ];
    const body = format === 'csv' ? spreadsheetCsv(rows) : await spreadsheetXlsx(rows);
    await this.transaction.run(storeId, () =>
      this.audit.record(storeId, {
        actor,
        action: 'orders.exported',
        entityType: 'store',
        entityId: storeId,
        after: { state: `${lines.length}_rows` },
      }),
    );
    return {
      filename: `dakly-orders-${calendarDay.format(now)}.${format}`,
      type: format === 'csv' ? CSV_TYPE : XLSX_TYPE,
      body,
      rowCount: lines.length,
    };
  }
}

function orderExportCells(
  line: OrderExportRow,
  calendarDay: Intl.DateTimeFormat,
  seeFullPhone: boolean,
) {
  let phone = line.recipientPhone ?? '';
  if (phone && !seeFullPhone) phone = maskPhone(phone);
  return [
    line.number,
    calendarDay.format(line.createdAt),
    orderStageLabels[line.stage],
    line.buyerName ?? '',
    line.recipientName,
    phone,
    line.district ?? '',
    line.productName,
    line.variantTitle,
    line.quantity,
    poishaToTakaText(line.unitPricePoisha),
    poishaToTakaText(line.lineDiscountPoisha),
    poishaToTakaText(line.deliveryChargePoisha),
    poishaToTakaText(line.orderDiscountPoisha),
    poishaToTakaText(line.advancePaidPoisha),
    poishaToTakaText(line.codAmountPoisha),
  ];
}
