import { describe, it, expect } from 'vitest';

import type { StaffAuditRow } from '@dakly/contracts/staff-audit';

import { exportCsv } from './staff-history.service';

const row: StaffAuditRow = {
  id: 'id',
  createdAt: 'date',
  staffUserId: null,
  actorUserId: null,
  operatorIdentity: null,
  action: 'fixture',
  storeId: null,
  targetType: null,
  targetId: null,
  reason: '',
  actionDetails: null,
  ip: null,
};
describe('audit CSV', () => {
  it('quotes cells and protects formulas including leading whitespace and watermark', () => {
    for (const value of ['=SUM(1,2)', '\t=SUM(1,2)', '\r+1', '\n-1', ' @formula']) {
      const csv = exportCsv(value, [{ ...row, reason: value }]);
      expect(csv).toContain(`"'${value}"`);
    }
    expect(exportCsv('Rina', [{ ...row, reason: 't=ordinary,r=ordinary,"quoted"' }])).toContain(
      '"t=ordinary,r=ordinary,""quoted"""',
    );
  });
});
