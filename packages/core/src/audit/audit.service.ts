import { Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';

import { AuditRepository } from './audit.repository';

@Injectable()
export class AuditService {
  constructor(private readonly repository: AuditRepository) {}
  async record(storeId: string, entry: AuditEntry): Promise<void> {
    await this.repository.insert(storeId, entry);
  }
}
