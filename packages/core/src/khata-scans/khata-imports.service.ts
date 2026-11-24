import { Inject, Injectable } from '@nestjs/common';

import {
  type ImportKhataPageInput,
  KHATA_CONFIDENCE_THRESHOLD,
  type KhataImportResponse,
} from '@dakly/contracts/khata-scans';

import { ContactsService } from '../contacts/contacts.service';
import { KhataCustomersService } from '../contacts/khata-customers.service';
import { DueBookService } from '../due-book/due-book.service';
import { KhataSalesService } from '../orders/khata-sales.service';
import { Clock } from '../platform/clock';
import { newId } from '../platform/database/new-id';
import { StoreTransaction } from '../platform/database/store-transaction';
import { DAY_MS } from '../platform/time';
import { khataScanError } from './khata-scans.errors';
import {
  type KhataImport,
  KhataScansRepository,
  type RowOutcome,
  type StoredKhataRow,
} from './khata-scans.repository';

// Rule 6: a past import can be undone for 7 days.
const UNDO_DAYS = 7;
const PAST_IMPORTS_LIMIT = 20;

type Decision = ImportKhataPageInput['rows'][number];

@Injectable()
export class KhataImportsService {
  constructor(
    @Inject(KhataScansRepository) private readonly repository: KhataScansRepository,
    @Inject(ContactsService) private readonly contacts: ContactsService,
    @Inject(KhataCustomersService) private readonly customers: KhataCustomersService,
    @Inject(KhataSalesService) private readonly sales: KhataSalesService,
    @Inject(DueBookService) private readonly dueBook: DueBookService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  // Everything the page makes is saved together, so a failed row leaves nothing half imported.
  importPage(
    storeId: string,
    userId: string,
    pageId: string,
    input: ImportKhataPageInput,
  ): Promise<KhataImportResponse> {
    return this.transaction.run(storeId, async () => {
      const page = await this.repository.findPage(storeId, pageId);
      if (!page) throw khataScanError('KHATA_PAGE_NOT_FOUND');
      if (page.status !== 'read') throw khataScanError('KHATA_PAGE_NOT_READ');
      if (await this.repository.hasDoneImport(storeId, pageId))
        throw khataScanError('KHATA_PAGE_ALREADY_IMPORTED');
      const rows = await this.repository.rowsForPages(storeId, [pageId]);
      const decisions = decisionsByRow(rows, input.rows);

      const importId = newId();
      await this.repository.insertImport(storeId, {
        id: importId,
        pageId,
        rowsRead: rows.length,
        createdByUserId: userId,
      });
      const customersByPhone = new Map<string, string>();
      const outcomes: RowOutcome[] = [];
      for (const row of rows)
        outcomes.push(
          await this.importRow({
            storeId,
            userId,
            row: withEdit(row, decisions.get(row.id)!),
            decision: decisions.get(row.id)!,
            customersByPhone,
          }),
        );
      const imported = outcomes.filter(({ outcome }) => outcome === 'imported').length;
      const saved = await this.repository.saveImportResult(storeId, importId, outcomes, {
        rowsImported: imported,
        rowsSkipped: outcomes.length - imported,
        customersCreated: outcomes.filter(({ isContactCreated }) => isContactCreated).length,
      });
      return toResponse(saved);
    });
  }

  async listImports(storeId: string): Promise<KhataImportResponse[]> {
    const found = await this.repository.listImports(storeId, PAST_IMPORTS_LIMIT);
    return found.map(toResponse);
  }

  // Undo removes what the import made. A customer someone has edited or given another baki since
  // stays, because removing it would delete work that is not the import's.
  undo(storeId: string, importId: string): Promise<KhataImportResponse> {
    return this.transaction.run(storeId, async () => {
      const found = await this.repository.findImport(storeId, importId);
      if (!found) throw khataScanError('KHATA_IMPORT_NOT_FOUND');
      if (found.status === 'undone') return toResponse(found);
      const now = this.clock.now();
      if (now.getTime() > undoUntil(found).getTime())
        throw khataScanError('KHATA_IMPORT_UNDO_EXPIRED');

      const rows = await this.repository.importedRows(storeId, importId);
      const entryIds = rows.flatMap((row) => (row.dueEntryId ? [row.dueEntryId] : []));
      // The rows point at the entries, so the pointers go before the entries do.
      await this.repository.resetPageRows(storeId, found.pageId);
      await this.dueBook.removeKhataEntries(storeId, entryIds);
      await this.sales.removeUnchanged(
        storeId,
        rows.flatMap((row) => (row.orderId ? [row.orderId] : [])),
      );

      const createdIds = [
        ...new Set(
          rows.flatMap((row) => (row.isContactCreated && row.contactId ? [row.contactId] : [])),
        ),
      ];
      const stillInUse = await this.dueBook.contactsWithEntries(storeId, createdIds);
      await this.customers.removeUnedited(
        storeId,
        createdIds.filter((id) => !stillInUse.has(id)),
      );
      await this.repository.markUndone(storeId, importId, now);
      return toResponse({ ...found, status: 'undone' });
    });
  }

  private async importRow({
    storeId,
    userId,
    row,
    decision,
    customersByPhone,
  }: {
    storeId: string;
    userId: string;
    row: StoredKhataRow;
    decision: Decision;
    customersByPhone: Map<string, string>;
  }): Promise<RowOutcome> {
    const skipped = {
      rowId: row.id,
      outcome: 'skipped',
      contactId: null,
      isContactCreated: false,
      dueEntryId: null,
      orderId: null,
    } as const;
    if (decision.action === 'skip') return skipped;
    if (row.confidence < KHATA_CONFIDENCE_THRESHOLD && !decision.isChecked)
      throw khataScanError('KHATA_ROW_NEEDS_CHECK');
    if (row.kind === 'sale')
      return this.importSale({ storeId, userId, row, decision, customersByPhone });
    const customer = await this.customerFor(storeId, row, decision, customersByPhone);
    const when = {
      amountPoisha: row.amountPoisha,
      note: row.item ?? undefined,
      occurredAt: this.entryTime(row.entryDate),
    };
    const recorder = { actor: { kind: 'user', userId } as const, source: 'khata_import' } as const;
    const entry =
      row.kind === 'baki'
        ? await this.dueBook.recordBaki(storeId, customer.contactId, when, recorder)
        : await this.dueBook.collectPayment(
            storeId,
            customer.contactId,
            { ...when, method: 'cash' },
            recorder,
          );
    return {
      rowId: row.id,
      outcome: 'imported',
      contactId: customer.contactId,
      isContactCreated: customer.isCreated,
      dueEntryId: entry.entry.id,
      orderId: null,
    };
  }

  // A sale with a phone or a chosen customer is linked to them; one without is a walk-in sale
  // and links to nobody (SHOP-R1).
  private async importSale({
    storeId,
    userId,
    row,
    decision,
    customersByPhone,
  }: {
    storeId: string;
    userId: string;
    row: StoredKhataRow;
    decision: Decision;
    customersByPhone: Map<string, string>;
  }): Promise<RowOutcome> {
    const customer =
      row.phone || decision.mergeContactId
        ? await this.customerFor(storeId, row, decision, customersByPhone)
        : undefined;
    const orderId = await this.sales.record(storeId, {
      userId,
      contactId: customer?.contactId ?? null,
      name: row.name,
      amountPoisha: row.amountPoisha,
      soldAt: new Date(this.entryTime(row.entryDate)),
    });
    return {
      rowId: row.id,
      outcome: 'imported',
      contactId: customer?.contactId ?? null,
      isContactCreated: customer?.isCreated ?? false,
      dueEntryId: null,
      orderId,
    };
  }

  // The owner's merge choice wins. Otherwise the phone decides: a customer who has it is used,
  // and a new one is made once however many rows carry it. Rows without a phone link to nobody.
  private async customerFor(
    storeId: string,
    row: StoredKhataRow,
    decision: Decision,
    customersByPhone: Map<string, string>,
  ): Promise<{ contactId: string; isCreated: boolean }> {
    if (decision.mergeContactId) {
      if (!(await this.contacts.findRecipient(storeId, decision.mergeContactId)))
        throw khataScanError('KHATA_MERGE_CONTACT_NOT_FOUND');
      return { contactId: decision.mergeContactId, isCreated: false };
    }
    if (!row.phone) throw khataScanError('KHATA_ROW_NEEDS_PHONE');
    const known = customersByPhone.get(row.phone);
    if (known) return { contactId: known, isCreated: false };
    const [existing] = await this.contacts.findImportMatches(storeId, [row.phone]);
    if (existing) return { contactId: existing.id, isCreated: false };
    const created = await this.customers.create(storeId, {
      name: row.name,
      phone: row.phone,
    });
    if (!created) throw khataScanError('KHATA_CUSTOMER_PHONE_TAKEN');
    customersByPhone.set(row.phone, created);
    return { contactId: created, isCreated: true };
  }

  // A page date has no time. Noon in Dhaka keeps it on the same day in every zone, and a date
  // that is today or not readable is recorded as now.
  private entryTime(entryDate: string | null): string {
    const now = this.clock.now();
    if (!entryDate) return now.toISOString();
    const noon = new Date(`${entryDate}T12:00:00+06:00`);
    return (noon > now ? now : noon).toISOString();
  }
}

// The owner's corrections replace what was read, for this import only.
function withEdit(row: StoredKhataRow, decision: Decision): StoredKhataRow {
  const { edit } = decision;
  if (!edit) return row;
  return {
    ...row,
    entryDate: edit.entryDate === undefined ? row.entryDate : edit.entryDate,
    name: edit.name ?? row.name,
    phone: edit.phone === undefined ? row.phone : edit.phone,
    item: edit.item === undefined ? row.item : edit.item,
    amountPoisha: edit.amountPoisha ?? row.amountPoisha,
  };
}

function decisionsByRow(rows: StoredKhataRow[], given: Decision[]): Map<string, Decision> {
  const decisions = new Map(given.map((decision) => [decision.rowId, decision]));
  const isComplete =
    decisions.size === given.length &&
    decisions.size === rows.length &&
    rows.every((row) => decisions.has(row.id));
  if (!isComplete) throw khataScanError('KHATA_IMPORT_ROWS_MISMATCH');
  return decisions;
}

function undoUntil(found: KhataImport): Date {
  return new Date(found.createdAt.getTime() + UNDO_DAYS * DAY_MS);
}

function toResponse(found: KhataImport): KhataImportResponse {
  return {
    id: found.id,
    pageId: found.pageId,
    status: found.status,
    rowsRead: found.rowsRead,
    rowsImported: found.rowsImported,
    rowsSkipped: found.rowsSkipped,
    customersCreated: found.customersCreated,
    createdAt: found.createdAt.toISOString(),
    undoUntil: undoUntil(found).toISOString(),
  };
}
