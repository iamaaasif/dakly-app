import { Inject, Injectable } from '@nestjs/common';

import { contactMemoryExtractionSchema } from '@dakly/contracts/contact-memory';

import { AiService } from '../ai/ai.service';
import { Clock } from '../platform/clock';
import { mergeMemory } from './contact-memory-merge';
import { memoryPromptInput } from './contact-memory-prompt-input';
import { renderContactMemory } from './contact-memory-render';
import { contactMemoryError } from './contact-memory.errors';
import { ContactMemoryRepository, type MemoryWork } from './contact-memory.repository';
import { updateContactMemory } from './prompts/update-contact-memory.v1';

// Both are down for a moment, not for this customer, so the queue should try again.
const transientFailures = new Set([
  'AI_PAUSED',
  'AI_STORE_BUSY',
  'LLM_TIMEOUT',
  'LLM_RATE_LIMITED',
  'LLM_UNAVAILABLE',
  'LLM_REQUEST_FAILED',
  'LLM_INVALID_RESPONSE',
]);

@Injectable()
export class ContactMemoryService {
  constructor(
    @Inject(ContactMemoryRepository) private readonly repository: ContactMemoryRepository,
    @Inject(AiService) private readonly ai: AiService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  dueConversations() {
    return this.repository.dueConversations(this.clock.now());
  }

  // Reads in one short transaction, calls the model outside it, then saves under version guards.
  // A batch that lost a race writes nothing and the queue retries from a fresh read.
  async updateFromConversation(
    storeId: string,
    conversationId: string,
    finalAttempt: boolean,
  ): Promise<void> {
    const work = await this.repository.load(storeId, conversationId);
    if (!work) return;
    const extraction = await this.extract(storeId, work);
    if (extraction === 'retry') {
      if (finalAttempt) return;
      throw contactMemoryError('CONTACT_MEMORY_UNAVAILABLE');
    }
    const saved = await this.repository.save(storeId, conversationId, {
      work,
      conversationSummary: extraction?.conversationSummary ?? null,
      memory: extraction ? mergeMemory(work, extraction) : null,
      builtAt: this.clock.now(),
    });
    if (!saved && !finalAttempt) throw contactMemoryError('CONTACT_MEMORY_CHANGED');
  }

  // The memory as text for the reply prompt, inside the byte and token caps, measured with the
  // tokenizer of the reply model. undefined when there is nothing to say or the cap cannot be checked.
  async contextFor(storeId: string, contactId: string): Promise<string | undefined> {
    const memory = await this.repository.read(storeId, contactId);
    if (!memory) return undefined;
    return renderContactMemory(memory, (text) => this.ai.countTokens('reply', text));
  }

  // Staff clear and a customer's deletion request both end here. Output of a call already running
  // fails its guard, and old messages and orders are never read again.
  async clear(storeId: string, contactId: string, userId: string): Promise<void> {
    if (!(await this.repository.clear(storeId, contactId, userId, this.clock.now())))
      throw contactMemoryError('CONTACT_NOT_FOUND');
  }

  private async extract(storeId: string, work: MemoryWork) {
    const input = memoryPromptInput(work);
    // Nothing to read: the batch is only voice notes that failed or stickers. Move past it.
    if (!input.new_customer_messages.length) return undefined;
    const result = await this.ai.run(storeId, {
      tier: 'fast',
      purpose: 'contact_memory',
      prompt: updateContactMemory,
      input: JSON.stringify(input),
      output: contactMemoryExtractionSchema,
    });
    if (result.kind === 'output') return result.output;
    // A reply the model cannot give for this customer would fail every time, so move past it.
    return result.kind === 'failure' && transientFailures.has(result.code) ? 'retry' : undefined;
  }
}
