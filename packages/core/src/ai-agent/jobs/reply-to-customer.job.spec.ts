import { describe, expect, it, vi } from 'vitest';

import type { AiAgentService } from '../ai-agent.service';
import { ReplyToCustomerJob } from './reply-to-customer.job';

const data = {
  storeId: '11111111-1111-4111-8111-111111111111',
  conversationId: '22222222-2222-4222-8222-222222222222',
  messageId: '33333333-3333-4333-8333-333333333333',
};

function agentThat({
  reply,
  handOver,
}: {
  reply: () => Promise<unknown>;
  handOver?: () => Promise<void>;
}) {
  const handOverAfterFailure = vi.fn(handOver ?? (async () => undefined));
  const agent = { reply: vi.fn(reply), handOverAfterFailure } as unknown as AiAgentService;
  return { job: new ReplyToCustomerJob(agent), handOverAfterFailure };
}

describe('ReplyToCustomerJob', () => {
  it('hands the chat to people when the last attempt fails, and still fails the job', async () => {
    const failure = new Error('model down');
    const { job, handOverAfterFailure } = agentThat({ reply: () => Promise.reject(failure) });
    await expect(job.handle(data, true)).rejects.toBe(failure);
    expect(handOverAfterFailure).toHaveBeenCalledWith(
      data.storeId,
      data.conversationId,
      data.messageId,
    );
  });

  it('leaves the chat alone while attempts remain, so a retry can still answer', async () => {
    const { job, handOverAfterFailure } = agentThat({
      reply: () => Promise.reject(new Error('model down')),
    });
    await expect(job.handle(data, false)).rejects.toThrow('model down');
    expect(handOverAfterFailure).not.toHaveBeenCalled();
  });

  it('reports the reply error when the hand-over fails too', async () => {
    const { job } = agentThat({
      reply: () => Promise.reject(new Error('model down')),
      handOver: () => Promise.reject(new Error('database down')),
    });
    await expect(job.handle(data, true)).rejects.toThrow('model down');
  });

  it('does nothing extra when the reply succeeds', async () => {
    const { job, handOverAfterFailure } = agentThat({ reply: async () => undefined });
    await expect(job.handle(data, true)).resolves.toBeUndefined();
    expect(handOverAfterFailure).not.toHaveBeenCalled();
  });
});
