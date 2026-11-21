import { Inject, Injectable, Optional } from '@nestjs/common';
import type { z } from 'zod';

import {
  contactMemorySchema,
  renderedContactMemorySchema,
  type ContactMemory,
  type ContactMemoryFact,
} from '@dakly/contracts/contact-memory';

import { AiService } from '../ai/ai.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { OutboxService } from '../platform/outbox/outbox.service';
import {
  mergeContactMemory,
  renderContactMemory,
  type ContactMemoryTokenCounter,
} from './contact-memory-rules';
import { contactMemoryError } from './contact-memory.errors';
import {
  ContactMemoryRepository,
  type ConversationMemoryState,
  type ConversationUpdate,
  type PendingMessage,
  type MessageCursor,
} from './contact-memory.repository';
import {
  updateConversationMemory,
  updateConversationMemoryOutputSchema,
} from './prompts/update-conversation-memory.v1';

export const CONTACT_MEMORY_TOKEN_COUNTER = Symbol('CONTACT_MEMORY_TOKEN_COUNTER');

const BATCH_SIZE = 100;
const MAX_ATTEMPTS = 3;
const MESSAGE_TEXT_LIMIT = 1000;

export type MemoryRunResult = 'updated' | 'nothing_new' | 'skipped';

// The model may only cite a message the customer wrote in this batch; the rest is dropped.
function modelFacts(
  facts: { kind: ContactMemoryFact['kind']; value: string; messageId: string }[],
  customerMessageIds: ReadonlySet<string>,
  at: Date,
): ContactMemoryFact[] {
  return facts
    .filter(({ messageId }) => customerMessageIds.has(messageId))
    .map(({ kind, value, messageId }) => ({
      kind,
      value,
      source: 'customer_message',
      sourceId: messageId,
      at: at.toISOString(),
    }));
}

function planWrite(input: {
  state: ConversationMemoryState;
  current: ContactMemory;
  output: z.infer<typeof updateConversationMemoryOutputSchema>;
  pending: PendingMessage[];
  orders: { id: string; district: string; at: Date }[];
  at: Date;
}) {
  const { state, current, output, pending, orders, at } = input;
  const learned = [
    ...modelFacts(output.facts, customerMessageIds(pending), at),
    ...orderFacts(orders),
  ];
  const merged = mergeContactMemory(current, learned, {
    summary: output.customerSummary,
    keepSummary: state.memory?.summaryEditedByStaff ?? false,
  });
  const changed = JSON.stringify(merged) !== JSON.stringify(current);
  const memory = changed
    ? { expectedVersion: state.memory?.version ?? null, ...merged, builtAt: at }
    : undefined;
  return { memory, outcome: changed ? ('updated' as const) : ('nothing_new' as const) };
}

const customerMessageIds = (pending: PendingMessage[]) =>
  new Set(
    pending
      .filter(({ direction, authorType }) => direction === 'in' && authorType === 'customer')
      .map(({ id }) => id),
  );

const orderFacts = (orders: { id: string; district: string; at: Date }[]): ContactMemoryFact[] =>
  orders.map((order) => ({
    kind: 'delivery_area',
    value: order.district,
    source: 'own_order',
    sourceId: order.id,
    at: order.at.toISOString(),
  }));

const parseFacts = (facts: unknown): ContactMemoryFact[] => {
  const parsed = contactMemorySchema.safeParse({ summary: '', facts });
  return parsed.success ? parsed.data.facts : [];
};

@Injectable()
export class ContactMemoryService {
  constructor(
    @Inject(ContactMemoryRepository) private readonly repository: ContactMemoryRepository,
    @Inject(AiService) private readonly ai: AiService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Optional()
    @Inject(CONTACT_MEMORY_TOKEN_COUNTER)
    private readonly countTokens: ContactMemoryTokenCounter | null = null,
  ) {}

  // Reads, calls the model with no transaction open, then writes under guards. A guard failure
  // means a clear, edit, merge or other chat got there first, so the result is dropped and the
  // state is read again.
  async updateFromConversation(storeId: string, conversationId: string): Promise<MemoryRunResult> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const state = await this.repository.readState(storeId, conversationId);
      if (!state || state.contactDeleted || !state.latest) return 'skipped';
      const ready = await this.dropWrongCheckpoint(storeId, conversationId, state);
      if (ready === 'reset') continue;
      const result = await this.runOnce(storeId, conversationId, state, state.latest);
      if (result !== 'stale') return result;
    }
    throw contactMemoryError('CONTACT_MEMORY_STALE');
  }

  private async dropWrongCheckpoint(
    storeId: string,
    conversationId: string,
    state: ConversationMemoryState,
  ) {
    if (!state.checkpoint) return 'ready';
    if (!(await this.repository.hasLateInsert(storeId, conversationId, state.checkpoint)))
      return 'ready';
    await this.repository.resetCheckpoint(storeId, conversationId, state.conversationVersion);
    return 'reset';
  }

  private async runOnce(
    storeId: string,
    conversationId: string,
    state: ConversationMemoryState,
    through: MessageCursor,
  ): Promise<MemoryRunResult | 'stale'> {
    const clearedAt = state.memory?.clearedAt ?? null;
    const pending = await this.repository.pendingMessages(
      storeId,
      conversationId,
      { after: state.checkpoint, clearedAt, through },
      BATCH_SIZE,
    );
    const last = pending.at(-1);
    const readable = pending.filter(({ text }) => text);
    // Notes, empty media and pre-clear messages carry nothing to learn; the checkpoint still moves
    // so the sweep does not pick this chat again.
    if (readable.length === 0 || !last) {
      return this.skipPast({ storeId, conversationId, state, next: last ?? through });
    }
    return this.learn({ storeId, conversationId, state, pending, readable, last });
  }

  private async skipPast(input: {
    storeId: string;
    conversationId: string;
    state: ConversationMemoryState;
    next: MessageCursor;
  }): Promise<MemoryRunResult | 'stale'> {
    if (input.state.checkpoint?.id === input.next.id) return 'skipped';
    const moved = await this.save({
      ...input,
      change: { conversationSummary: input.state.conversationSummary },
    });
    return moved ? 'skipped' : 'stale';
  }

  private async learn(input: {
    storeId: string;
    conversationId: string;
    state: ConversationMemoryState;
    pending: PendingMessage[];
    readable: PendingMessage[];
    last: MessageCursor;
  }): Promise<MemoryRunResult | 'stale'> {
    const { storeId, conversationId, state, pending, readable, last } = input;
    const current: ContactMemory = {
      summary: state.memory?.summary ?? '',
      facts: parseFacts(state.memory?.facts),
    };
    const attempt = await this.askModel(storeId, state, current, readable);
    if (attempt.kind === 'failure' && attempt.code === 'AI_PAUSED') return 'skipped';
    if (attempt.kind !== 'output') throw contactMemoryError('CONTACT_MEMORY_MODEL_FAILED');

    const at = this.clock.now();
    const orders = await this.repository.selfDeliveryOrders(
      storeId,
      state.contactId,
      state.memory?.clearedAt ?? null,
    );
    const { memory, outcome } = planWrite({
      state,
      current,
      output: attempt.output,
      pending,
      orders,
      at,
    });
    const saved = await this.save({
      storeId,
      conversationId,
      state,
      next: last,
      change: { conversationSummary: attempt.output.conversationSummary, memory },
    });
    return saved ? outcome : 'stale';
  }

  private save(input: {
    storeId: string;
    conversationId: string;
    state: ConversationMemoryState;
    next: MessageCursor;
    change: Pick<ConversationUpdate, 'conversationSummary' | 'memory'>;
  }) {
    const { storeId, conversationId, state, next, change } = input;
    return this.repository.saveConversationUpdate(storeId, {
      contactId: state.contactId,
      conversationId,
      expectedConversationVersion: state.conversationVersion,
      expectedCheckpoint: state.checkpoint,
      next: { id: next.id, at: next.at },
      ...change,
    });
  }

  private askModel(
    storeId: string,
    state: ConversationMemoryState,
    current: ContactMemory,
    readable: { id: string; direction: string; text: string | null }[],
  ) {
    return this.ai.run(storeId, {
      tier: 'fast',
      purpose: 'contact_memory',
      prompt: updateConversationMemory,
      input: [
        `<customer_notes>${JSON.stringify(current)}</customer_notes>`,
        `<conversation_summary>${state.conversationSummary ?? ''}</conversation_summary>`,
        `<new_messages untrusted="true">${JSON.stringify(
          readable.map(({ id, direction, text }) => ({
            id,
            from: direction === 'in' ? 'customer' : 'shop',
            text: text?.slice(0, MESSAGE_TEXT_LIMIT),
          })),
        )}</new_messages>`,
      ].join('\n'),
      output: updateConversationMemoryOutputSchema,
    });
  }

  // The caller has already changed ownership in its transaction; this joins it so the memories are
  // emptied and the rebuild is queued atomically with that change.
  async invalidateForOwnershipChange(storeId: string, contactIds: string[]) {
    await this.transaction.run(storeId, async () => {
      const invalidated = await this.repository.invalidateDerived(storeId, contactIds);
      const occurredAt = this.clock.now().toISOString();
      await this.outbox.publishAll(
        invalidated.map((contactId) => ({
          type: 'contact_memory.rebuild_requested',
          storeId,
          occurredAt,
          payload: { contactId },
        })),
      );
    });
  }

  async rebuild(storeId: string, contactId: string) {
    for (const conversationId of await this.repository.conversationIdsOf(storeId, contactId)) {
      let result: MemoryRunResult;
      do result = await this.updateFromConversation(storeId, conversationId);
      while (result !== 'skipped');
    }
  }

  clear(storeId: string, contactId: string, userId: string | null) {
    return this.repository.clear(storeId, contactId, this.clock.now(), userId);
  }

  // Staff may keep what is stored and add or change their own facts, never forge a model fact.
  async saveStaffEdit(storeId: string, contactId: string, userId: string, input: unknown) {
    const parsed = contactMemorySchema.safeParse(input);
    if (!parsed.success) throw contactMemoryError('CONTACT_MEMORY_INVALID');
    const stored = parseFacts((await this.repository.readMemory(storeId, contactId))?.facts);
    const forged = parsed.data.facts.some(
      (fact) =>
        (fact.source === 'staff' && fact.sourceId !== contactId) ||
        (fact.source !== 'staff' &&
          !stored.some(
            (existing) =>
              existing.source === fact.source &&
              existing.sourceId === fact.sourceId &&
              existing.kind === fact.kind &&
              existing.value === fact.value,
          )),
    );
    if (forged) throw contactMemoryError('CONTACT_MEMORY_INVALID');
    await this.repository.saveStaffMemory(storeId, contactId, {
      ...parsed.data,
      userId,
      at: this.clock.now(),
    });
  }

  // Context for the reply prompt. Null means leave memory out.
  async contextFor(storeId: string, contactId: string): Promise<string | null> {
    const memory = await this.repository.readMemory(storeId, contactId);
    if (!memory) return null;
    const rendered = renderContactMemory(
      { summary: memory.summary, facts: parseFacts(memory.facts) },
      this.countTokens,
    );
    const checked = renderedContactMemorySchema.safeParse(rendered);
    return checked.success ? checked.data.text : null;
  }
}
