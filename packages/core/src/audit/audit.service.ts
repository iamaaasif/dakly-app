import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import type { AuditEntry } from '@dakly/contracts/audit';
import { orderStages, type OrderStageHistoryEntry } from '@dakly/contracts/orders';

import { AuditRepository } from './audit.repository';

const stageSnapshot = z.object({ stage: z.enum(orderStages) });

@Injectable()
export class AuditService {
  constructor(private readonly repository: AuditRepository) {}
  async orderStages(storeId: string, orderId: string): Promise<OrderStageHistoryEntry[]> {
    const rows = await this.repository.orderStages(storeId, orderId);
    return rows.map(({ before, after, createdAt, ...row }) => ({
      ...row,
      from: stageSnapshot.parse(before).stage,
      to: stageSnapshot.parse(after).stage,
      occurredAt: createdAt.toISOString(),
    }));
  }

  async record(storeId: string, entry: AuditEntry): Promise<void> {
    await this.repository.insert(storeId, entry);
  }
}
