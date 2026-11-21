import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';

import { contactMemoryFactSchema } from '@dakly/contracts/contact-memory';
import {
  type ContactMergeResponse,
  type MergeContactsInput,
  consentChannels,
  consentStatuses,
} from '@dakly/contracts/contacts';

import { AuditService } from '../audit/audit.service';
import { ContactMemoryService } from '../contact-memory/contact-memory.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { OutboxService } from '../platform/outbox/outbox.service';
import { DAY_MS } from '../platform/time';
import { planMergeConsents, planUndoConsents } from './contact-merge-consents';
import { planFieldMerge, planFieldUndo } from './contact-merge-fields';
import {
  ContactMergeRepository,
  type MergeRecord,
  type StoredContact,
} from './contact-merge.repository';
import { contactError } from './contacts.errors';

// D29: a staff merge can be undone for seven days.
const UNDO_WINDOW_MS = 7 * DAY_MS;

const values = z.record(z.string(), z.unknown());
const afterStateSchema = z.object({
  fields: values,
  adoptedFacts: z.array(contactMemoryFactSchema),
  consents: z.array(
    z.object({ channel: z.enum(consentChannels), status: z.enum(consentStatuses) }),
  ),
});
const movedRowsSchema = z.object({
  identities: z.array(z.string()),
  conversations: z.array(z.string()),
  orders: z.array(z.string()),
  tasks: z.array(z.string()),
  comments: z.array(z.string()),
});

@Injectable()
export class ContactMergeService {
  constructor(
    @Inject(ContactMergeRepository) private readonly repository: ContactMergeRepository,
    @Inject(ContactMemoryService) private readonly memory: ContactMemoryService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  // The older contact keeps its id and takes the other one's chats, orders, notes and identities.
  // Retrying a key that was already used returns the recorded merge, even after an undo.
  merge(storeId: string, userId: string, input: MergeContactsInput): Promise<ContactMergeResponse> {
    if (input.otherContactId === input.contactId) throw contactError('CONTACT_MERGE_SAME_CONTACT');
    return this.transaction.run(storeId, async () => {
      const found = await this.repository.lockContacts(storeId, [
        input.contactId,
        input.otherContactId,
      ]);
      const recorded = await this.repository.findByOperationKey(storeId, input.operationKey);
      if (recorded) return toMergeResponse(recorded, null);
      if (found.length !== 2 || found.some((contact) => contact.deletedAt))
        throw contactError('CONTACT_NOT_FOUND');
      const [kept, merged] = [...found].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
      ) as [StoredContact, StoredContact];
      if (await this.repository.hasChatOnSamePage(storeId, kept.id, merged.id))
        throw contactError('CONTACT_MERGE_CHAT_CONFLICT');
      if (await this.repository.hasDueEntries(storeId, merged.id))
        throw contactError('CONTACT_MERGE_HAS_DUE');
      const record = await this.combine(storeId, userId, { kept, merged }, input.operationKey);
      await this.announce(storeId, userId, record, 'merged');
      return toMergeResponse(record, merged.name);
    });
  }

  private async combine(
    storeId: string,
    userId: string,
    { kept, merged }: { kept: StoredContact; merged: StoredContact },
    operationKey: string,
  ) {
    const now = this.clock.now();
    const fields = planFieldMerge(kept, merged);
    // The merged contact is hidden first so its phone is free for the kept one.
    await this.repository.updateContact(storeId, merged.id, { deletedAt: now, updatedAt: now });
    await this.repository.updateContact(storeId, kept.id, {
      ...contactValues(fields.after),
      updatedAt: now,
    });
    const moved = await this.repository.moveRows(storeId, merged.id, kept.id);
    const answers = planMergeConsents(
      await this.repository.currentConsents(storeId, kept.id),
      await this.repository.currentConsents(storeId, merged.id),
    );
    await this.repository.appendConsents(
      storeId,
      answers.map((answer) => ({
        ...answer,
        contactId: kept.id,
        evidence: `merge ${operationKey}`,
        userId,
        at: now,
      })),
    );
    const adoptedFacts = await this.memory.resetForMerge(storeId, {
      keptContactId: kept.id,
      mergedContactId: merged.id,
    });
    const record = await this.repository.insertMerge(storeId, {
      operationKey,
      keptContactId: kept.id,
      mergedContactId: merged.id,
      movedRows: moved,
      replacedFields: fields.before,
      afterState: { fields: fields.after, adoptedFacts, consents: answers },
      mergedByUserId: userId,
      undoUntil: new Date(now.getTime() + UNDO_WINDOW_MS),
      createdAt: now,
    });
    await this.repository.closeSuggestions(storeId, [kept.id, merged.id], userId, now);
    return record;
  }

  // Puts back only what the merge changed and still stands. Later edits, new rows and a phone now
  // used by someone else stay as they are, and are named in the result.
  undo(storeId: string, userId: string, mergeId: string): Promise<ContactMergeResponse> {
    return this.transaction.run(storeId, async () => {
      const record = await this.repository.lockMerge(storeId, mergeId);
      if (!record) throw contactError('CONTACT_MERGE_NOT_FOUND');
      if (record.undoneAt) return toMergeResponse(record, null);
      const { kept, merged } = await this.lockUndoable(storeId, record);
      const conflicts = await this.revert(storeId, userId, { record, kept, merged });
      const undone = { ...record, undoneAt: this.clock.now(), undoConflicts: conflicts };
      await this.announce(storeId, userId, undone, 'merge_undone');
      return toMergeResponse(undone, merged.name);
    });
  }

  private async lockUndoable(storeId: string, record: MergeRecord) {
    const { keptContactId, mergedContactId } = record;
    if (
      !keptContactId ||
      !mergedContactId ||
      record.evidenceRedactedAt ||
      record.undoUntil <= this.clock.now()
    )
      throw contactError('CONTACT_MERGE_UNDO_CLOSED');
    if (await this.repository.hasLaterActiveMerge(storeId, record))
      throw contactError('CONTACT_MERGE_UNDO_BLOCKED');
    const found = await this.repository.lockContacts(storeId, [keptContactId, mergedContactId]);
    const kept = found.find((contact) => contact.id === keptContactId);
    const merged = found.find((contact) => contact.id === mergedContactId);
    if (!kept || !merged || kept.deletedAt || !merged.deletedAt)
      throw contactError('CONTACT_MERGE_UNDO_CLOSED');
    return { kept, merged };
  }

  private async revert(
    storeId: string,
    userId: string,
    { record, kept, merged }: { record: MergeRecord; kept: StoredContact; merged: StoredContact },
  ): Promise<string[]> {
    const now = this.clock.now();
    const after = afterStateSchema.parse(record.afterState);
    const fields = planFieldUndo(kept, values.parse(record.replacedFields), after.fields);
    await this.repository.updateContact(storeId, kept.id, {
      ...contactValues(fields.restore),
      updatedAt: now,
    });
    const conflicts = [
      ...fields.conflicts,
      ...(await this.repository.returnRows(storeId, movedRowsSchema.parse(record.movedRows), {
        fromId: kept.id,
        toId: merged.id,
      })),
    ];
    const phoneTaken =
      merged.phone !== null &&
      (await this.repository.phoneOwnerId(storeId, merged.phone, merged.id)) !== undefined;
    if (phoneTaken) conflicts.push('phone');
    await this.repository.updateContact(storeId, merged.id, {
      deletedAt: null,
      updatedAt: now,
      ...(phoneTaken ? { phone: null, phoneVerifiedAt: null } : {}),
    });
    await this.restoreConsents(storeId, { userId, record, now, after });
    await this.memory.resetForUndo(
      storeId,
      { keptContactId: kept.id, mergedContactId: merged.id },
      after.adoptedFacts,
    );
    await this.repository.markUndone(storeId, record.id, { userId, at: now, conflicts });
    return conflicts;
  }

  private async announce(
    storeId: string,
    userId: string,
    record: MergeRecord,
    kind: 'merged' | 'merge_undone',
  ) {
    const { keptContactId, mergedContactId } = ids(record);
    await this.audit.record(storeId, {
      actor: { kind: 'user', userId },
      action: kind === 'merged' ? 'contacts.merged' : 'contacts.merge_undone',
      entityType: 'contact',
      entityId: keptContactId,
      after: { ids: [mergedContactId] },
    });
    await this.outbox.publish({
      type: kind === 'merged' ? 'contact.merged' : 'contact.merge_undone',
      storeId,
      occurredAt: this.clock.now().toISOString(),
      payload: { keptContactId, mergedContactId },
    });
  }

  async listUndoable(storeId: string, contactId: string): Promise<ContactMergeResponse[]> {
    const rows = await this.repository.listUndoable(storeId, contactId, this.clock.now());
    return rows.map(({ merge, mergedContactName }) => toMergeResponse(merge, mergedContactName));
  }

  private async restoreConsents(
    storeId: string,
    input: {
      userId: string;
      record: MergeRecord;
      now: Date;
      after: z.infer<typeof afterStateSchema>;
    },
  ) {
    const { record, now, userId } = input;
    const { keptContactId, mergedContactId } = record;
    if (!keptContactId || !mergedContactId) return;
    const plan = planUndoConsents({
      kept: await this.repository.currentConsents(storeId, keptContactId),
      merged: await this.repository.currentConsents(storeId, mergedContactId),
      mergedAt: record.createdAt,
      appended: input.after.consents,
    });
    const evidence = `undo merge ${record.operationKey}`;
    await this.repository.appendConsents(storeId, [
      ...plan.forKept.map((answer) => ({
        ...answer,
        contactId: keptContactId,
        evidence,
        userId,
        at: now,
      })),
      ...plan.forMerged.map((answer) => ({
        ...answer,
        contactId: mergedContactId,
        evidence,
        userId,
        at: now,
      })),
    ]);
  }
}

// An erased customer leaves no ids behind, so there is nothing to show or undo.
function ids({ keptContactId, mergedContactId }: MergeRecord) {
  if (!keptContactId || !mergedContactId) throw contactError('CONTACT_NOT_FOUND');
  return { keptContactId, mergedContactId };
}

function toMergeResponse(
  record: MergeRecord,
  mergedContactName: string | null,
): ContactMergeResponse {
  return {
    id: record.id,
    ...ids(record),
    mergedContactName,
    mergedAt: record.createdAt.toISOString(),
    undoUntil: record.undoUntil.toISOString(),
    undoneAt: record.undoneAt?.toISOString() ?? null,
    undoConflicts: z.array(z.string()).parse(record.undoConflicts),
  };
}

// Stored values are JSON; the one date column needs a Date again.
function contactValues(fields: Record<string, unknown>) {
  const { phoneVerifiedAt, ...rest } = fields;
  return {
    ...rest,
    ...(phoneVerifiedAt === undefined
      ? {}
      : { phoneVerifiedAt: phoneVerifiedAt === null ? null : new Date(phoneVerifiedAt as string) }),
  };
}
