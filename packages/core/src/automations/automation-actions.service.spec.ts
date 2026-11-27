import { describe, expect, it, vi } from 'vitest';

import type { CommentAutomationRepliesService } from '../comments/comment-automation-replies.service';
import { AppError } from '../platform/errors/app-error';
import { AutomationActionsService, pickLine } from './automation-actions.service';
import type { RunFacts } from './automation-step-rules';

const now = new Date('2026-11-27T10:00:00.000Z');
const lines = ['ইনবক্সে দাম জানিয়ে দিয়েছি', 'Inbox e details dilam', 'Sent you the details'];
const facts = { storeId: 's', runId: 'run-1', commentId: 'c-1' } as RunFacts;

function service(replies: Partial<CommentAutomationRepliesService>) {
  return new AutomationActionsService(replies as CommentAutomationRepliesService);
}
const publicStep = (next = 'end') =>
  ({ kind: 'action', action: { action: 'reply_to_comment', lines }, next }) as const;
const privateStep = {
  kind: 'action',
  action: { action: 'send_private_reply', text: 'Details niche', includeProduct: true },
  next: 'end',
} as const;

describe('pickLine', () => {
  it('keeps one wording for one run and uses every wording across runs', () => {
    expect(pickLine(lines, 'abc')).toBe(pickLine(lines, 'abc'));
    const picked = new Set(Array.from({ length: 30 }, (_, i) => pickLine(lines, `run-${i}`)));
    expect(picked.size).toBe(lines.length);
  });
});

describe('comment reply steps', () => {
  it('posts one of the wordings and records a public reply', async () => {
    const replyPublicly = vi.fn(async () => 'sent' as const);
    const result = await service({ replyPublicly }).run('reply', publicStep(), facts, now);
    expect(lines).toContain(replyPublicly.mock.calls[0]![2]);
    expect(result).toMatchObject({
      step: { kind: 'action', outcome: 'replied_publicly' },
      next: { stepKey: 'end' },
    });
  });

  it('records a DM, and a skip when another reply already won', async () => {
    const replyPrivately = vi.fn(async () => 'sent' as const);
    expect(await service({ replyPrivately }).run('dm', privateStep, facts, now)).toMatchObject({
      step: { outcome: 'sent_dm' },
    });
    replyPrivately.mockResolvedValue('skipped');
    expect(await service({ replyPrivately }).run('dm', privateStep, facts, now)).toMatchObject({
      step: { outcome: 'skipped' },
      next: { stepKey: 'end' },
    });
  });

  it('never posts a wording that holds a price, even from an older saved version', async () => {
    const replyPublicly = vi.fn();
    const step = {
      ...publicStep(),
      action: { action: 'reply_to_comment', lines: ['৪৫০ টাকা মাত্র', 'Price 450 tk'] },
    } as const;
    const result = await service({ replyPublicly }).run('reply', step, facts, now);
    expect(replyPublicly).not.toHaveBeenCalled();
    expect(result.run.status).toBe('failed');
  });

  it('ends the run when Meta did not confirm, and fails a step with no comment', async () => {
    const unconfirmed = new AppError('COMMENT_UNCONFIRMED', {
      status: 503,
      message: 'Unconfirmed',
    });
    const replyPrivately = vi.fn(async () => Promise.reject(unconfirmed));
    expect((await service({ replyPrivately }).run('dm', privateStep, facts, now)).run.status).toBe(
      'failed',
    );
    expect(
      (await service({}).run('dm', privateStep, { ...facts, commentId: null }, now)).run.status,
    ).toBe('failed');
  });
});
