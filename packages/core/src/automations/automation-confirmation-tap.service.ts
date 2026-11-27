import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';

import type { AutomationStep } from '@dakly/contracts/automations/graph';
import { orderConfirmationAnswerSchema, type OrderStage } from '@dakly/contracts/orders';

import { ChannelDispatchService } from '../messaging/channel-dispatch.service';
import { MessagingService } from '../messaging/messaging.service';
import { OrderConfirmationService } from '../orders/order-confirmation.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AppError } from '../platform/errors/app-error';
import { SendPolicyService } from '../sending/send-policy.service';
import { AutomationRunsRepository } from './automation-runs.repository';
import { operationKey } from './automation-step-rules';

const confirmationTap = z.tuple([z.literal('workflow'), z.uuid(), orderConfirmationAnswerSchema]);
const closedReply = 'এই অর্ডার এখন আর বদলানো যাবে না। দোকানের সঙ্গে যোগাযোগ করুন।';
const tapReplies: Partial<Record<OrderStage, string>> = {
  on_hold: 'অর্ডারটি আপাতত স্থগিত আছে।',
  to_pack: 'অর্ডার নিশ্চিত হয়েছে। দোকান শীঘ্রই পাঠানোর ব্যবস্থা করবে।',
  with_courier: 'অর্ডারটি কুরিয়ারের কাছে দেওয়া হয়েছে।',
  delivered: 'অর্ডারটি পৌঁছে দেওয়া হয়েছে।',
  partially_delivered: 'অর্ডারের কিছু পণ্য পৌঁছে দেওয়া হয়েছে।',
  returned: 'অর্ডারটি ফেরত এসেছে।',
  cancelled: 'অর্ডার বাতিল হয়েছে। দোকানকে জানিয়ে দেওয়া হয়েছে।',
};

@Injectable()
export class AutomationConfirmationTapService {
  constructor(
    @Inject(AutomationRunsRepository) private readonly runs: AutomationRunsRepository,
    @Inject(OrderConfirmationService) private readonly orders: OrderConfirmationService,
    @Inject(ChannelDispatchService) private readonly dispatch: ChannelDispatchService,
    @Inject(MessagingService) private readonly messaging: MessagingService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(SendPolicyService) private readonly sendPolicy: SendPolicyService,
  ) {}

  async answer(
    storeId: string,
    {
      contactId,
      conversationId,
      postback,
      identityId,
      tapKey,
    }: {
      contactId: string;
      conversationId: string;
      postback: string;
      identityId: string;
      tapKey: string;
    },
  ): Promise<void> {
    const tap = confirmationTap.safeParse(postback.split(':'));
    if (!tap.success) return;
    const [, stepId, answer] = tap.data;
    await this.transaction.run(storeId, async () => {
      // Contact erasure locks the contact before it detaches orders and removes workflow steps.
      if (!(await this.sendPolicy.lockForDispatch(storeId, contactId))) return;
      const send = await this.runs.lockConfirmationSend(storeId, stepId, contactId);
      if (!send?.orderId) return;
      if (!hasAnswerButton(send.graph.steps[send.stepKey], answer)) return;
      const target = await this.dispatch.messengerSendTarget(storeId, {
        operationKey: operationKey(send),
        conversationId,
        contactId,
        identityId,
      });
      if (!target) return;

      const stage = await this.orders.answerFromMessenger(
        storeId,
        send.orderId,
        contactId,
        send.tappedAt ? undefined : answer,
      );
      if (!stage) return;
      if (!send.tappedAt) await this.runs.recordConfirmationTap(storeId, stepId, this.clock.now());
      await this.messaging
        .queueChannelMessage(storeId, {
          ...target,
          content: tapReplies[stage] ?? closedReply,
          category: 'transactional',
          actor: { kind: 'system' },
          operationKey: `order-confirmation-tap:${tapKey}`,
        })
        .catch((error: unknown) => {
          // A replay can read a newer stage after the original event already queued its reply.
          if (!(error instanceof AppError) || error.code !== 'MESSAGE_OPERATION_CONFLICT')
            throw error;
        });
    });
  }
}

function hasAnswerButton(step: AutomationStep | undefined, answer: 'confirm' | 'cancel'): boolean {
  return step?.kind === 'send' && step.message.buttons.some(({ key }) => key === answer);
}
