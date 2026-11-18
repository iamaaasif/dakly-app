import { Injectable } from '@nestjs/common';

import type { AuditEntry, AuditHistoryQuery } from '@dakly/contracts/audit';

import { AuditRepository } from './audit.repository';

@Injectable()
export class AuditService {
  constructor(private readonly repository: AuditRepository) {}

  history(storeId: string, query: AuditHistoryQuery) {
    return this.repository.history(storeId, query);
  }

  async record(storeId: string, entry: AuditEntry): Promise<void> {
    await this.repository.insert(storeId, entry);
  }
}
