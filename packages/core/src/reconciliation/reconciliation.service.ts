import { Inject, Injectable } from '@nestjs/common';

import type {
  ReconciliationLine,
  SettlementLineActionInput,
} from '@dakly/contracts/admin-reconciliation';

import { Clock } from '../platform/clock';
import { ReconciliationRepository, type SettlementLine } from './reconciliation.repository';

const QUEUE_PAGE = 200;

@Injectable()
export class ReconciliationService {
  constructor(
    @Inject(ReconciliationRepository) private readonly repository: ReconciliationRepository,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async queue(): Promise<ReconciliationLine[]> {
    return (await this.repository.openLines(QUEUE_PAGE)).map(toLine);
  }

  async close(input: {
    auditId: string;
    staffUserId: string;
    lineId: string;
    change: SettlementLineActionInput;
    ip: string;
  }): Promise<ReconciliationLine> {
    return toLine(await this.repository.close({ ...input, now: this.clock.now() }));
  }
}

function toLine(line: SettlementLine): ReconciliationLine {
  return {
    id: line.id,
    gateway: line.gateway,
    settlementDate: line.settlementDate,
    gatewayTransactionId: line.gatewayTransactionId,
    amountPoisha: line.amountPoisha,
    feePoisha: line.feePoisha,
    status: line.status,
    note: line.note,
  };
}
