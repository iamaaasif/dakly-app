import { Inject, Injectable } from '@nestjs/common';

import { publicReplyProblem } from '@dakly/contracts/automations/comment-reply';
import type { AutomationStep } from '@dakly/contracts/automations/graph';

import { CommentAutomationRepliesService } from '../comments/comment-automation-replies.service';
import { AppError } from '../platform/errors/app-error';
import { failed, goOn, type RunFacts, type StepResult } from './automation-step-rules';

type ActionStep = Extract<AutomationStep, { kind: 'action' }>;

// A person gets one wording and keeps it on a retry; the next person's run id picks another, so the
// lines rotate across the shop's commenters.
export function pickLine(lines: string[], runId: string) {
  const hash = [...runId].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return lines[hash % lines.length]!;
}

// A reply Meta refused, or whose outcome is unknown, ends the run: an unknown reply may be on the
// post already, so it is never sent again.
const endingErrors = ['COMMENT_REJECTED', 'COMMENT_UNCONFIRMED'];

@Injectable()
export class AutomationCommentStepsService {
  constructor(
    @Inject(CommentAutomationRepliesService)
    private readonly replies: CommentAutomationRepliesService,
  ) {}

  async run(stepKey: string, { action, next }: ActionStep, facts: RunFacts, now: Date) {
    const { storeId, commentId } = facts;
    if (!commentId) return failed('This step needs a comment', now);
    try {
      const outcome = await this.send(storeId, commentId, action, facts.runId);
      if (typeof outcome === 'object') return failed(outcome.problem, now);
      const done =
        outcome === 'sent'
          ? action.action === 'reply_to_comment'
            ? 'replied_publicly'
            : 'sent_dm'
          : 'skipped';
      return {
        ...goOn(next, now),
        step: { stepKey, kind: 'action', outcome: done },
      } satisfies StepResult;
    } catch (error) {
      if (error instanceof AppError && endingErrors.includes(error.code))
        return failed(error.message, now);
      throw error;
    }
  }

  private async send(
    storeId: string,
    commentId: string,
    action: ActionStep['action'],
    runId: string,
  ) {
    if (action.action === 'reply_to_comment') {
      const line = pickLine(action.lines, runId);
      // The graph schema already refuses these; a version saved before the rule must not post one.
      const problem = publicReplyProblem(line);
      return problem ? { problem } : this.replies.replyPublicly(storeId, commentId, line);
    }
    if (action.action === 'send_private_reply')
      return this.replies.replyPrivately(storeId, commentId, action);
    return { problem: 'This action does not answer a comment' };
  }
}
