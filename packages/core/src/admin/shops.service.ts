import { Inject, Injectable } from '@nestjs/common';

import type {
  AdminShopDetail,
  AdminShopListQuery,
  AdminShopListResponse,
} from '@dakly/contracts/admin-shops';
import type { StaffIdentity } from '@dakly/contracts/staff-auth';

import { StaffTransaction } from '../platform/database/staff-transaction';
import { ShopsRepository } from './shops.repository';
import { supportError } from './support.errors';

const PAGE_SIZE = 25;

@Injectable()
export class ShopsService {
  constructor(
    @Inject(ShopsRepository) private readonly repository: ShopsRepository,
    @Inject(StaffTransaction) private readonly transaction: StaffTransaction,
  ) {}

  async list(query: AdminShopListQuery): Promise<AdminShopListResponse> {
    const rows = await this.repository.list(query, PAGE_SIZE + 1);
    const page = rows.slice(0, PAGE_SIZE);
    const last = page.at(-1);
    return {
      rows: page,
      cursor: rows.length > PAGE_SIZE && last ? `${last.createdAt}|${last.storeId}` : null,
    };
  }

  // The view is recorded before the metadata is returned, so no read goes unrecorded (ADM-R3).
  async detail(
    staff: StaffIdentity & { sessionId: string },
    storeId: string,
    ip: string,
  ): Promise<AdminShopDetail> {
    const detail = await this.repository.detail(storeId);
    if (!detail) throw supportError('STORE_NOT_FOUND');
    await this.transaction.run(staff.id, () => this.repository.recordView(staff.id, storeId, ip));
    return detail;
  }
}
