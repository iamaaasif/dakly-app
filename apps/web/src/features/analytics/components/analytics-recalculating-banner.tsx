import { formatCount } from '@dakly/contracts/money';
import type { AttributionSettingsResponse } from '@dakly/contracts/stores';

export function AnalyticsRecalculatingBanner({
  settings,
}: {
  settings: AttributionSettingsResponse;
}) {
  return (
    <div role="status" className="rounded-md bg-info-soft p-4 text-info">
      <p className="font-medium">Recalculating with the new {settings.windowDays}-day window</p>
      <p className="text-sm">
        {settings.processedOrders
          ? `${formatCount(settings.processedOrders)} orders checked so far. `
          : ''}
        The numbers below update when it is done.
      </p>
    </div>
  );
}
