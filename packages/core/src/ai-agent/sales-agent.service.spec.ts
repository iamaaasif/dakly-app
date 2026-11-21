import { expect, it, vi } from 'vitest';

import type { AiService } from '../ai/ai.service';
import type { InboxService } from '../messaging/inbox.service';
import type { StoresService } from '../stores/stores.service';
import type { SalesAgentToolsService } from './sales-agent-tools.service';
import { SalesAgentService } from './sales-agent.service';

const storeId = 'store-1';

function build() {
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
  return { service: new SalesAgentService(ai, tools, inbox, stores), run, inbox };
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
