import { expect, it, vi } from 'vitest';

import type { AiService } from '../ai/ai.service';
import type { ContactMemoryService } from '../contact-memory/contact-memory.service';
import type { InboxService } from '../messaging/inbox.service';
import type { StoresService } from '../stores/stores.service';
import type { SalesAgentToolsService } from './sales-agent-tools.service';
import { SalesAgentService } from './sales-agent.service';

const storeId = 'store-1';

function build(memoryText: string | undefined = undefined) {
  const run = vi.fn().mockResolvedValue({
    kind: 'output',
    aiRunId: 'run-1',
    output: { reply: 'ok' },
  });
  const ai = { run } as unknown as AiService;
  const tools = {
    run: vi.fn().mockResolvedValue({ products: [] }),
  } as unknown as SalesAgentToolsService;
  const inbox = { messages: vi.fn() } as unknown as InboxService;
  const stores = {
    settings: vi.fn().mockResolvedValue({ name: 'Shop', phone: '0171', district: 'Dhaka' }),
  } as unknown as StoresService;
  const memory = {
    contextFor: vi.fn().mockResolvedValue(memoryText),
  } as unknown as ContactMemoryService;
  return { service: new SalesAgentService(ai, tools, inbox, stores, memory), run, inbox, memory };
}

it('puts a practice question, which has no saved chat, into the model conversation', async () => {
  const { service, run } = build();

  await service.compose({ storeId, contactId: 'c-1', customerTexts: ['Delivery charge koto?'] });

  const input: string = run.mock.calls[0]![1].input;
  expect(input).toContain(
    '<conversation untrusted="true">[{"from":"customer","text":"Delivery charge koto?"}]</conversation>',
  );
});

it('reads a real chat from its saved messages, not from the texts again', async () => {
  const { service, run, inbox } = build();
  vi.mocked(inbox.messages).mockResolvedValue({
    items: [{ kind: 'text', direction: 'in', body: 'saved question' }],
  } as never);

  await service.compose({
    storeId,
    contactId: 'c-1',
    chat: { conversationId: 'conv-1', channel: 'messenger' },
    customerTexts: ['saved question'],
  });

  const input: string = run.mock.calls[0]![1].input;
  expect(input.match(/saved question/g)).toHaveLength(1);
});

it('puts the remembered facts between the shop and the conversation, as untrusted data', async () => {
  const { service, run, memory } = build('Remembered from earlier chats.\n- size: M');

  await service.compose({ storeId, contactId: 'c-1', customerTexts: ['Panjabi ache?'] });

  const input: string = run.mock.calls[0]![1].input;
  expect(memory.contextFor).toHaveBeenCalledWith(storeId, 'c-1');
  expect(input).toContain(
    '<customer_memory untrusted="true">Remembered from earlier chats.\n- size: M</customer_memory>',
  );
  expect(input.indexOf('<shop>')).toBeLessThan(input.indexOf('<customer_memory'));
  expect(input.indexOf('<customer_memory')).toBeLessThan(input.indexOf('<conversation'));
});

it('sends no memory block when the customer has none', async () => {
  const { service, run } = build();

  await service.compose({ storeId, contactId: 'c-1', customerTexts: ['Panjabi ache?'] });

  expect(run.mock.calls[0]![1].input).not.toContain('customer_memory');
});
