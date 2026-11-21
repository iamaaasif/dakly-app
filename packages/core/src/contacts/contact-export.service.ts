import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import { type ContactExportQuery, MAX_EXPORT_ROWS } from '@dakly/contracts/contacts';
import type { StoreAccess } from '@dakly/contracts/team';

import { AuditService } from '../audit/audit.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { ContactExportRepository, type ExportedContact } from './contact-export.repository';
import type { MatchFilter } from './contact-filters.repository';
import { ContactPhoneAccessService } from './contact-phone-access.service';
import { searchFilter } from './contact-search';
import { contactError } from './contacts.errors';

type Access = Pick<StoreAccess, 'seeFullPhone' | 'exportLists'>;
type Actor = Extract<AuditEntry['actor'], { kind: 'user' }>;

const PAGE_SIZE = 1000;
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// The columns are the import's fields, so an exported file can be imported again. The phones are
// left out for members who do not see full numbers, because a masked number is no use in a file.
const columns: { header: string; value: (contact: ExportedContact) => string; phone?: true }[] = [
  { header: 'Name', value: (contact) => contact.name ?? '' },
  { header: 'Phone', value: (contact) => contact.phone ?? '', phone: true },
  { header: 'WhatsApp number', value: (contact) => contact.whatsappPhone ?? '', phone: true },
  { header: 'Email', value: (contact) => contact.email ?? '' },
  { header: 'Address', value: (contact) => contact.address ?? '' },
  { header: 'District', value: (contact) => contact.district ?? '' },
  { header: 'Tags', value: (contact) => contact.tags.join(', ') },
  { header: 'Type', value: (contact) => contact.kind },
  { header: 'Source', value: (contact) => contact.source },
  { header: 'Added', value: (contact) => contact.createdAt.toISOString().slice(0, 10) },
];

@Injectable()
export class ContactExportService {
  constructor(
    @Inject(ContactExportRepository) private readonly contacts: ContactExportRepository,
    @Inject(ContactPhoneAccessService) private readonly phoneAccess: ContactPhoneAccessService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async export(storeId: string, query: ContactExportQuery, access: Access, actor: Actor) {
    if (!access.exportLists) throw contactError('CONTACT_EXPORT_NOT_ALLOWED');
    const { search, ...filter } = query;
    const match = searchFilter(search, access.seeFullPhone);
    if (match.phone) await this.phoneAccess.checkLimit(storeId, 'lookup', false, actor);

    const rows = await this.readAll(storeId, { ...filter, ...match });
    const shown = columns.filter((column) => !column.phone || access.seeFullPhone);
    const sheet = [
      shown.map(({ header }) => ({ value: header, fontWeight: 'bold' as const })),
      ...rows.map((contact) => shown.map((column) => ({ value: column.value(contact) }))),
    ];
    // The package ships as an ES module, which this CommonJS build can only load this way.
    const { default: writeXlsxFile } = await import('write-excel-file/node');
    const body = await writeXlsxFile(sheet).toBuffer();
    // A download of customers is a record of who took them, so it is saved with its size.
    await this.transaction.run(storeId, () =>
      this.audit.record(storeId, {
        actor,
        action: 'contacts.exported',
        entityType: 'store',
        entityId: storeId,
        after: { state: `${rows.length}_rows` },
      }),
    );
    return {
      filename: `dakly-customers-${this.clock.now().toISOString().slice(0, 10)}.xlsx`,
      type: XLSX_TYPE,
      body,
      rowCount: rows.length,
    };
  }

  private async readAll(storeId: string, filter: MatchFilter) {
    const rows: ExportedContact[] = [];
    for (;;) {
      const page = await this.contacts.page(
        storeId,
        { ...filter, cursor: rows.at(-1)?.id },
        PAGE_SIZE,
      );
      rows.push(...page);
      if (rows.length > MAX_EXPORT_ROWS) throw contactError('CONTACT_EXPORT_TOO_LARGE');
      if (page.length < PAGE_SIZE) return rows;
    }
  }
}
