import { Lightbulb } from 'lucide-react';

import type { AnalyticsTipStep, AnalyticsView } from '@dakly/contracts/analytics';
import { Card } from '@dakly/ui/card';

import { useAnalyticsTip } from '../api/analytics-attribution';

const stepPhrases: Record<AnalyticsTipStep, string> = {
  delivered: 'of your messages reached the phone',
  read: 'of people read your message',
  tapped: 'of people tapped your link',
  ordered: 'of people who tapped went on to order',
};

export function AnalyticsTip({ period }: { period: AnalyticsView['period'] }) {
  const { data } = useAnalyticsTip(period);
  const tip = data?.tip;
  if (!tip) return null;
  return (
    <Card className="flex items-start gap-3 bg-primary-soft">
      <Lightbulb aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-action" />
      <div>
        <h2 className="font-semibold">A tip</h2>
        <p>
          {tip.currentPercent}% {stepPhrases[tip.step]} this period, against your usual{' '}
          {tip.usualPercent}%.
          {tip.suggestion && ` ${tip.suggestion}`}
        </p>
      </div>
    </Card>
  );
}
