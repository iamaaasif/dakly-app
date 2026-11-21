import { describe, expect, it, vi } from 'vitest';

import type { AiService } from '../ai/ai.service';
import type { InboxService } from '../messaging/inbox.service';
import type { StoresService } from '../stores/stores.service';
import type { SalesAgentToolsService } from './sales-agent-tools.service';
import { SalesAgentService } from './sales-agent.service';

type Step = { kind: 'tools'; calls: [string, object][] } | { kind: 'reply' };

function agent(steps: Step[], customerTexts: string[]) {
  const run = vi.fn<(name: string) => Promise<object>>(async (name) =>
    name === 'draft_order' ? { orderNumber: 7 } : { stage: 'to_pack' },
  );
  const queue = [...steps];
  const ai = {
    run: async () => {
      const step = queue.shift()!;
      return step.kind === 'reply'
        ? { kind: 'output', aiRunId: 'run', output: { reply: 'ok' } }
        : {
            kind: 'tools',
            toolCalls: step.calls.map(([name, args]) => ({
              name,
              argumentsJson: JSON.stringify(args),
            })),
          };
    },
  } as unknown as AiService;
  const service = new SalesAgentService(
    ai,
    { run: (_scope: unknown, name: string) => run(name) } as unknown as SalesAgentToolsService,
    { messages: async () => ({ items: [] }) } as unknown as InboxService,
    {
      settings: async () => ({ name: 'Shop', phone: null, district: null }),
    } as unknown as StoresService,
  );
  return { run, compose: () => service.compose({ storeId: 's', contactId: 'c', customerTexts }) };
}

const confirm: Step = { kind: 'tools', calls: [['confirm_order', { orderNumber: 7 }]] };

describe('SalesAgentService order confirmation', () => {
  it('confirms an order after the customer said yes', async () => {
    const { run, compose } = agent([confirm, { kind: 'reply' }], ['হ্যাঁ']);
    await compose();
    expect(run).toHaveBeenCalledWith('confirm_order');
  });

  it('does not confirm when the customer never said yes', async () => {
    const { run, compose } = agent([confirm, { kind: 'reply' }], ['amar order 7 er khobor ki']);
    const reply = await compose();
    expect(run).not.toHaveBeenCalledWith('confirm_order');
    expect(reply).toMatchObject({
      toolResults: expect.arrayContaining([{ error: 'CONFIRMATION_NOT_GIVEN' }]),
    });
  });

  it('does not confirm an order drafted in the same turn, even after a yes', async () => {
    const draft: Step = { kind: 'tools', calls: [['draft_order', {}]] };
    const { run, compose } = agent([draft, confirm, { kind: 'reply' }], ['yes']);
    await compose();
    expect(run).not.toHaveBeenCalledWith('confirm_order');
  });
});
