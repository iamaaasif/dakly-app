import { Inject, Injectable } from '@nestjs/common';

import type { SmsSenderIdResponse } from '@dakly/contracts/sms-senders';
import type { StaffIdentity } from '@dakly/contracts/staff-auth';

import { StoreTransaction } from '../platform/database/store-transaction';
import { SmsSendersService } from '../sms-senders/sms-senders.service';
import { SupportAuditService } from './support-audit.service';
import { SupportService } from './support.service';

type Staff = StaffIdentity & { sessionId: string };

// The staff audit row is written before the change, in the same transaction (D28, ADM-R3).
@Injectable()
export class SmsSenderReviewService {
  constructor(
    @Inject(SupportService) private readonly support: SupportService,
    @Inject(SupportAuditService) private readonly audit: SupportAuditService,
    @Inject(SmsSendersService) private readonly smsSenders: SmsSendersService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
  ) {}

  decide(
    staff: Staff,
    storeId: string,
    decision: { smsSenderIdId: string; status: 'approved' | 'rejected'; reason: string },
    ip: string,
  ): Promise<SmsSenderIdResponse> {
    const actor = { kind: 'staff', staffUserId: staff.id } as const;
    return this.transaction.run(storeId, async () => {
      await this.support.authorizeStoreReview(storeId, staff);
      await this.audit.record(storeId, {
        id: decision.smsSenderIdId,
        actor,
        action: `sms_sender_id.${decision.status}`,
        reason: decision.reason,
        ip,
        entityType: 'sms_sender_id',
      });
      return this.smsSenders.decideRequest(storeId, decision.smsSenderIdId, decision, actor);
    });
  }
}
