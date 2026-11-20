import { describe, expect, it } from 'vitest';

import type { AuditService } from '../audit/audit.service';
import type { UsersService } from '../auth/users.service';
import type { BillingService } from '../billing/billing.service';
import type { Clock } from '../platform/clock';
import type { StoreTransaction } from '../platform/database/store-transaction';
import type { OutboxService } from '../platform/outbox/outbox.service';
import type { SessionsService } from '../sessions/sessions.service';
import type { TeamService } from '../team/team.service';
import type { MaintenanceStoresRepository } from './maintenance-stores.repository';
import type { StoresRepository } from './stores.repository';
import { StoresService } from './stores.service';

const STORE_ID = '0193a3c4-5d1e-7b8f-9a0b-1c2d3e4f5a6b';

function serviceWith(sending: unknown) {
  const repository = { sendingSettings: async () => ({ timeZone: 'Asia/Dhaka', sending }) };
  const unused = {};
  return new StoresService(
    unused as UsersService,
    unused as Clock,
    repository as unknown as StoresRepository,
    unused as MaintenanceStoresRepository,
    unused as StoreTransaction,
    unused as TeamService,
    unused as BillingService,
    unused as SessionsService,
    unused as AuditService,
    unused as OutboxService,
  );
}

describe('StoresService', () => {
  it('fills the frequency cap from the defaults when only quiet hours were saved', async () => {
    const service = serviceWith({ quietHours: { startHour: 22, endHour: 8 } });

    expect(await service.sendingSettings(STORE_ID)).toEqual({
      timeZone: 'Asia/Dhaka',
      quietHours: { startHour: 22, endHour: 8 },
      frequencyCap: { perChannelPerDay: 1, perSevenDays: 3 },
      onlyOwnersAndAdminsApprove: true,
    });
  });

  it('uses every default for a store that never saved the section', async () => {
    expect(await serviceWith(null).sendingSettings(STORE_ID)).toEqual({
      timeZone: 'Asia/Dhaka',
      quietHours: { startHour: 21, endHour: 9 },
      frequencyCap: { perChannelPerDay: 1, perSevenDays: 3 },
      onlyOwnersAndAdminsApprove: true,
    });
  });
});
