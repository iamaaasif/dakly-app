import { readSheet } from 'read-excel-file/node';
import { describe, expect, it } from 'vitest';

import type { AuditService } from '../audit/audit.service';
import type { Clock } from '../platform/clock';
import type { StoreTransaction } from '../platform/database/store-transaction';
import type { ContactExportRepository, ExportedContact } from './contact-export.repository';
import { ContactExportService } from './contact-export.service';
import type { ContactPhoneAccessService } from './contact-phone-access.service';

const actor = { kind: 'user', userId: 'user' } as const;
const allowed = { exportLists: true, seeFullPhone: true };

const rahima: ExportedContact = {
  id: '1',
  name: 'রহিমা, আক্তার',
  phone: '01712345678',
  whatsappPhone: '01812345678',
  email: 'rahima@example.com',
  address: '=House 4',
  district: 'Dhaka',
  kind: 'customer',
  source: 'import',
  tags: ['eid', 'vip'],
  createdAt: new Date('2026-11-02T10:00:00Z'),
};

function service(contacts: ExportedContact[], recorded: unknown[] = []) {
  const repository = {
    page: async (
      _store: string,
      filter: { cursor?: string },
      limit: number,
    ): Promise<ExportedContact[]> => {
      const from = filter.cursor ? contacts.findIndex(({ id }) => id === filter.cursor) + 1 : 0;
      return contacts.slice(from, from + limit);
    },
  };
  return new ContactExportService(
    repository as unknown as ContactExportRepository,
    { checkLimit: async () => undefined } as unknown as ContactPhoneAccessService,
    { record: async (_store: string, entry: unknown) => void recorded.push(entry) } as AuditService,
    { run: (_store: string, work: () => unknown) => work() } as unknown as StoreTransaction,
    { now: () => new Date('2026-11-20T04:00:00Z') } as Clock,
  );
}

describe('customer export', () => {
  it('writes the customers as an Excel file that keeps text as text', async () => {
    const file = await service([rahima]).export('store', {}, allowed, actor);
    expect(file.filename).toBe('dakly-customers-2026-11-20.xlsx');
    expect(await readSheet(file.body)).toEqual([
      [
        'Name',
        'Phone',
        'WhatsApp number',
        'Email',
        'Address',
        'District',
        'Tags',
        'Type',
        'Source',
        'Added',
      ],
      [
        'রহিমা, আক্তার',
        '01712345678',
        '01812345678',
        'rahima@example.com',
        '=House 4',
        'Dhaka',
        'eid, vip',
        'customer',
        'import',
        '2026-11-02',
      ],
    ]);
  });

  it('leaves the phone columns out for a member who does not see full numbers', async () => {
    const file = await service([rahima]).export(
      'store',
      {},
      { exportLists: true, seeFullPhone: false },
      actor,
    );
    const [header, row] = await readSheet(file.body);
    expect(header).not.toContain('Phone');
    expect(header).not.toContain('WhatsApp number');
    expect(JSON.stringify(row)).not.toContain('0171');
  });

  it('refuses a member without the Download customer lists switch', async () => {
    await expect(
      service([rahima]).export('store', {}, { exportLists: false, seeFullPhone: true }, actor),
    ).rejects.toMatchObject({ code: 'CONTACT_EXPORT_NOT_ALLOWED' });
  });

  it('refuses more customers than one file may hold', async () => {
    const tooMany = Array.from({ length: 50_001 }, (_, index) => ({
      ...rahima,
      id: String(index),
    }));
    await expect(service(tooMany).export('store', {}, allowed, actor)).rejects.toMatchObject({
      code: 'CONTACT_EXPORT_TOO_LARGE',
    });
  });

  it('reads every page and records who took how many customers', async () => {
    const recorded: unknown[] = [];
    const many = Array.from({ length: 2500 }, (_, index) => ({ ...rahima, id: String(index) }));
    const file = await service(many, recorded).export('store', {}, allowed, actor);
    expect(file.rowCount).toBe(2500);
    expect(recorded).toMatchObject([
      { action: 'contacts.exported', actor: { userId: 'user' }, after: { state: '2500_rows' } },
    ]);
  });
});
