import type { CampaignResultsResponse } from '@dakly/contracts/campaigns';
import { formatCount } from '@dakly/contracts/money';

// Codes the sender writes; anything else shows as its own text so nothing is hidden.
const failureLabels: Record<string, string> = {
  provider_confirmed_not_sent: 'The provider did not send it',
  outcome_unknown: 'The provider did not confirm the result',
  send_attempts_exhausted: 'Still failing after several tries',
  recipient_unreachable: 'The customer could not be reached',
  unknown: 'No reason given',
};

export function CampaignFailures({ results }: { results: CampaignResultsResponse }) {
  if (results.failureReasons.length === 0) return null;
  return (
    <section aria-labelledby="failures-heading" className="max-w-xl space-y-3">
      <h2 id="failures-heading" className="text-lg font-semibold">
        Failures
      </h2>
      <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
        {results.failureReasons.map(({ code, count }) => (
          <li key={code} className="flex items-center justify-between gap-3 p-3">
            <span className="break-words">{failureLabels[code] ?? code}</span>
            <span className="font-semibold tabular-nums">{formatCount(count)}</span>
          </li>
        ))}
      </ul>
      {results.smsFallbackCount > 0 ? (
        <p className="text-sm text-text-muted">
          {formatCount(results.smsFallbackCount)} of them agreed to SMS and have a phone number, so
          they can be reached by SMS.
        </p>
      ) : null}
    </section>
  );
}
