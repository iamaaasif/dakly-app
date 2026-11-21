import { Inject, Injectable } from '@nestjs/common';

import type { AnalyticsAiAgentResponse, AnalyticsQuery } from '@dakly/contracts/analytics';

import { AiChatReportService } from '../messaging/ai-chat-report.service';
import { percent } from './analytics-ratios';
import { AnalyticsService } from './analytics.service';

// Model calls a chat causes: the reply, its category, and reading a customer's voice note or photo.
const AGENT_PURPOSES = [
  'chat_reply',
  'comment_reply',
  'classify',
  'transcribe',
  'describe_image',
  'contact_memory',
] as const;

@Injectable()
export class AnalyticsAiAgentService {
  constructor(
    @Inject(AnalyticsService) private readonly reports: AnalyticsService,
    @Inject(AiChatReportService) private readonly chats: AiChatReportService,
  ) {}

  async aiAgent(storeId: string, { period }: AnalyticsQuery): Promise<AnalyticsAiAgentResponse> {
    const { asOf, timeZone, current, previous } = await this.reports.periods(storeId, period);
    const now = { ...current, timeZone };
    const before = { ...previous, timeZone };
    const [chatsNow, chatsBefore, ordersNow, ordersBefore, costNow, costBefore] = await Promise.all(
      [
        this.chats.chats(storeId, now),
        this.chats.chats(storeId, before),
        this.reports.aiOrders(storeId, now),
        this.reports.aiOrders(storeId, before),
        this.reports.aiCostMicroUsd(storeId, now, AGENT_PURPOSES),
        this.reports.aiCostMicroUsd(storeId, before, AGENT_PURPOSES),
      ],
    );
    const handedOver = (rows: typeof chatsNow) =>
      rows.handedOver.reduce((total, row) => total + row.chats, 0);
    const resolution = (rows: typeof chatsNow) =>
      percent(rows.resolved, rows.aiChats - rows.inProgress);

    return {
      asOf,
      timeZone,
      current,
      previous,
      chats: { current: chatsNow.aiChats, previous: chatsBefore.aiChats },
      resolved: { current: chatsNow.resolved, previous: chatsBefore.resolved },
      resolutionPercent: { current: resolution(chatsNow), previous: resolution(chatsBefore) },
      answeredByPerson: {
        current: chatsNow.answeredByPerson,
        previous: chatsBefore.answeredByPerson,
      },
      handedOver: { current: handedOver(chatsNow), previous: handedOver(chatsBefore) },
      stillOpen: chatsNow.inProgress,
      handoverReasons: [...chatsNow.handedOver].sort((a, b) => b.chats - a.chats),
      orders: { current: ordersNow.count, previous: ordersBefore.count },
      sales: {
        currentPoisha: ordersNow.salesPoisha.toString(),
        previousPoisha: ordersBefore.salesPoisha.toString(),
      },
      cost: { currentMicroUsd: costNow.toString(), previousMicroUsd: costBefore.toString() },
    };
  }
}
