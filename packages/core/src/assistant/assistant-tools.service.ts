import { Inject, Injectable } from '@nestjs/common';
import { ZodError } from 'zod';

import {
  assistantTools,
  getCustomersTool,
  getMarketingResultsTool,
  getSalesTool,
  type AssistantToolDefinition,
  type ReportWindow,
} from '@dakly/contracts/assistant-tools';
import type { StoreAccess } from '@dakly/contracts/team';
import type { LlmTool } from '@dakly/providers/llm/llm-driver';

import { AnalyticsService } from '../analytics/analytics.service';
import { AppError } from '../platform/errors/app-error';
import { TeamService } from '../team/team.service';

type Handler = (storeId: string, raw: unknown) => Promise<object>;
type Periods = Awaited<ReturnType<AnalyticsService['periods']>>;
type Total = { total: bigint };

const windowDays = { last_7_days: 7, last_30_days: 30, last_90_days: 90 } as const;

const toLlmTool = (tool: AssistantToolDefinition): LlmTool => ({
  name: tool.name,
  input: tool.input,
  description: [
    tool.description,
    `Words owners use: ${tool.aliases.join(', ')}.`,
    ...Object.entries(tool.units).map(([field, unit]) => `${field}: ${unit}.`),
  ].join(' '),
});

// Read-only. The session supplies the store, and each tool is offered only when the member can view its area.
@Injectable()
export class AssistantToolsService {
  private readonly handlers: Record<string, Handler> = {
    [getSalesTool.name]: (storeId, raw) => this.sales(storeId, raw),
    [getMarketingResultsTool.name]: (storeId, raw) => this.marketingResults(storeId, raw),
    [getCustomersTool.name]: (storeId, raw) => this.customers(storeId, raw),
  };

  constructor(
    @Inject(AnalyticsService) private readonly reports: AnalyticsService,
    @Inject(TeamService) private readonly team: TeamService,
  ) {}

  available(access: StoreAccess): AssistantToolDefinition[] {
    return assistantTools.filter((tool) => this.team.canAccess(access, tool.area, 'view'));
  }

  llmTools(access: StoreAccess): LlmTool[] {
    return this.available(access).map(toLlmTool);
  }

  // The result goes back to the model, so a failure it can act on is a result, not a throw.
  async run(storeId: string, access: StoreAccess, name: string, argumentsJson: string) {
    const allowed = this.available(access).some((tool) => tool.name === name);
    const handler = allowed && Object.hasOwn(this.handlers, name) ? this.handlers[name] : undefined;
    if (!handler) return { error: 'UNKNOWN_TOOL' };
    try {
      return await handler(storeId, parseJson(argumentsJson));
    } catch (error) {
      if (error instanceof ZodError) return { error: 'INVALID_ARGUMENTS' };
      if (error instanceof AppError && error.status < 500) return { error: error.code };
      throw error;
    }
  }

  private async sales(storeId: string, raw: unknown) {
    const { window } = getSalesTool.input.parse(raw);
    const periods = await this.reports.periods(storeId, windowDays[window]);
    const [orders, sales, averageOrderValue] = await Promise.all([
      this.comparison(periods, (period) => this.reports.orders(storeId, period)),
      this.comparison(periods, (period) => this.reports.sales(storeId, period)),
      this.comparison(periods, (period) => this.reports.averageOrderValue(storeId, period)),
    ]);
    return {
      ...windowFacts(window, periods),
      orders: Number(orders.current),
      previousOrders: Number(orders.previous),
      ordersChangePercent: changePercent(orders.current, orders.previous),
      salesTaka: taka(sales.current),
      previousSalesTaka: taka(sales.previous),
      salesChangePercent: changePercent(sales.current, sales.previous),
      averageOrderValueTaka: taka(averageOrderValue.current),
      previousAverageOrderValueTaka: taka(averageOrderValue.previous),
    };
  }

  private async marketingResults(storeId: string, raw: unknown) {
    const { window } = getMarketingResultsTool.input.parse(raw);
    const periods = await this.reports.periods(storeId, windowDays[window]);
    const [revenue, orders] = await Promise.all([
      this.comparison(periods, (period) => this.reports.marketingRevenue(storeId, period)),
      this.comparison(periods, (period) => this.reports.marketingOrders(storeId, period)),
    ]);
    return {
      ...windowFacts(window, periods),
      revenueTaka: taka(revenue.current),
      previousRevenueTaka: taka(revenue.previous),
      revenueChangePercent: changePercent(revenue.current, revenue.previous),
      orders: Number(orders.current),
      previousOrders: Number(orders.previous),
      ordersChangePercent: changePercent(orders.current, orders.previous),
    };
  }

  private async customers(storeId: string, raw: unknown) {
    const { window } = getCustomersTool.input.parse(raw);
    const periods = await this.reports.periods(storeId, windowDays[window]);
    const [newCustomers, cameBack, stages] = await Promise.all([
      this.comparison(periods, (period) => this.reports.newCustomers(storeId, period)),
      this.comparison(periods, (period) => this.reports.customersWhoCameBack(storeId, period)),
      this.reports.lifecycleCounts(storeId, periods.current),
    ]);
    return {
      ...windowFacts(window, periods),
      newCustomers: Number(newCustomers.current),
      previousNewCustomers: Number(newCustomers.previous),
      newCustomersChangePercent: changePercent(newCustomers.current, newCustomers.previous),
      cameBack: Number(cameBack.current),
      previousCameBack: Number(cameBack.previous),
      cameBackChangePercent: changePercent(cameBack.current, cameBack.previous),
      stages,
    };
  }

  private async comparison(periods: Periods, read: (period: Periods['current']) => Promise<Total>) {
    const [current, previous] = await Promise.all([read(periods.current), read(periods.previous)]);
    return { current: current.total, previous: previous.total };
  }
}

function parseJson(argumentsJson: string): unknown {
  try {
    return JSON.parse(argumentsJson);
  } catch {
    return undefined;
  }
}

const taka = (poisha: bigint) => Number(poisha) / 100;

// Null when the earlier window had nothing to compare against.
function changePercent(current: bigint, previous: bigint): number | null {
  if (previous === 0n) return null;
  return Math.round(((Number(current) - Number(previous)) / Number(previous)) * 1000) / 10;
}

const windowFacts = (window: ReportWindow, { current }: Periods) => ({
  window,
  days: windowDays[window],
  from: current.from,
  through: current.through,
});
