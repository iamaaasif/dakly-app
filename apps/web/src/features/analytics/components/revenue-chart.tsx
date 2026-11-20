'use client';

import { useState } from 'react';

import type { AnalyticsChannel, AnalyticsOverviewResponse } from '@dakly/contracts/analytics';
import { cn } from '@dakly/ui/cn';

import { channelFills, channelLabels } from '../analytics-labels';
import { formatShortDate } from '@/lib/format-date';
import { formatCompactTaka, formatWholeTaka } from '@/lib/format-money';

const WIDTH = 720;
const HEIGHT = 240;
const LEFT = 56;
const TOP = 8;
const BOTTOM = 24;

type Week = AnalyticsOverviewResponse['weeklyRevenue'][number];

export function RevenueChart({
  data,
  compare,
}: {
  data: AnalyticsOverviewResponse;
  compare: boolean;
}) {
  const [hidden, setHidden] = useState<ReadonlySet<AnalyticsChannel>>(new Set());
  const toggle = (channel: AnalyticsChannel) =>
    setHidden((current) => {
      const next = new Set(current);
      if (!next.delete(channel)) next.add(channel);
      return next;
    });
  return (
    <div className="space-y-4">
      <ul className="flex flex-wrap gap-3">
        {data.channels.map(({ channel, revenuePoisha }) => (
          <li key={channel}>
            <button
              type="button"
              aria-pressed={!hidden.has(channel)}
              onClick={() => toggle(channel)}
              className={cn(
                'flex min-h-10 flex-col rounded-md border border-border px-3 py-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                hidden.has(channel) && 'opacity-50',
              )}
            >
              <span className="flex items-center gap-2 text-sm">
                <span
                  aria-hidden
                  className={cn('rounded-xs size-2.5', channelFills[channel].swatch)}
                />
                {channelLabels[channel]}
              </span>
              <span className="font-semibold tabular-nums">
                {formatWholeTaka(BigInt(revenuePoisha))}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <WeeklyBars
        weeks={data.weeklyRevenue}
        shown={data.channels.map(({ channel }) => channel).filter((c) => !hidden.has(c))}
        previous={compare ? data.previousWeeklyRevenuePoisha.map(BigInt) : []}
      />
    </div>
  );
}

function WeeklyBars({
  weeks,
  shown,
  previous,
}: {
  weeks: Week[];
  shown: AnalyticsChannel[];
  previous: bigint[];
}) {
  const totals = weeks.map(({ byChannel }) =>
    shown.reduce((sum, channel) => sum + BigInt(byChannel[channel] ?? '0'), 0n),
  );
  const step = niceStep([...totals, ...previous].reduce((a, b) => (b > a ? b : a), 0n));
  const top = step * 4n;
  const plotHeight = HEIGHT - TOP - BOTTOM;
  const slot = (WIDTH - LEFT) / Math.max(1, weeks.length);
  const y = (value: bigint) => TOP + plotHeight - (Number(value) / Number(top)) * plotHeight;
  const previousPath = previous
    .map((value, index) => `${index ? 'L' : 'M'}${LEFT + slot * (index + 0.5)},${y(value)}`)
    .join(' ');
  return (
    <div className="overflow-x-auto">
      <svg
        role="img"
        aria-label="Money from your marketing by week and channel"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full min-w-[32rem] text-text-muted"
      >
        <Axis ticks={[0n, step, step * 2n, step * 3n, top]} y={y} />
        {weeks.map((week, index) => (
          <WeekBars
            key={week.weekStart}
            week={week}
            index={index}
            count={weeks.length}
            shown={shown}
            slot={slot}
            y={y}
          />
        ))}
        {previousPath && (
          <path
            d={previousPath}
            fill="none"
            className="stroke-text-subtle"
            strokeWidth="2"
            strokeDasharray="5 4"
          />
        )}
      </svg>
    </div>
  );
}

// Four even steps of 1, 2 or 5 times a power of ten, so the axis reads ৳0, ৳0.5L, ৳1.0L and not ৳66.7K.
function niceStep(value: bigint): bigint {
  const raw = Math.max(1, Number(value / 100n) / 4);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const unit = [1, 2, 5, 10].find((candidate) => candidate * magnitude >= raw) ?? 10;
  return BigInt(unit * magnitude) * 100n;
}

function Axis({ ticks, y }: { ticks: bigint[]; y: (value: bigint) => number }) {
  return (
    <>
      {ticks.map((tick) => (
        <g key={tick.toString()}>
          <line
            x1={LEFT}
            x2={WIDTH}
            y1={y(tick)}
            y2={y(tick)}
            className="stroke-border"
            strokeDasharray="3 4"
          />
          <text x={LEFT - 8} y={y(tick) + 4} textAnchor="end" className="fill-text-subtle text-xs">
            {formatCompactTaka(tick)}
          </text>
        </g>
      ))}
    </>
  );
}

function WeekBars({
  week: { weekStart, byChannel },
  index,
  count,
  shown,
  slot,
  y,
}: {
  week: Week;
  index: number;
  count: number;
  shown: AnalyticsChannel[];
  slot: number;
  y: (value: bigint) => number;
}) {
  let floor = 0n;
  return (
    <g>
      {shown.map((channel) => {
        const value = BigInt(byChannel[channel] ?? '0');
        const bottom = y(floor);
        floor += value;
        return value === 0n ? null : (
          <rect
            key={channel}
            x={LEFT + slot * index + slot * 0.2}
            width={slot * 0.6}
            y={y(floor)}
            height={bottom - y(floor)}
            className={channelFills[channel].fill}
          />
        );
      })}
      {index % Math.ceil(count / 8) === 0 && (
        <text
          x={LEFT + slot * (index + 0.5)}
          y={HEIGHT - 6}
          textAnchor="middle"
          className="fill-text-subtle text-xs"
        >
          {formatShortDate(`${weekStart}T00:00:00Z`, 'UTC')}
        </text>
      )}
    </g>
  );
}
