import type { AttributionWindow } from '@dakly/contracts/stores';
import { cn } from '@dakly/ui/cn';
import { Sheet } from '@dakly/ui/sheet';

import { useChangeAttributionWindow } from '../api/analytics-attribution';

const windows: AttributionWindow[] = [1, 3, 7];

const notCounted = [
  'Cancelled orders.',
  'Walk-in shop sales with no phone number.',
  'Messages the customer received but did not read or tap.',
  'Reads and taps older than your window.',
  'Orders from a customer Dakly cannot match by phone number.',
];

type Props = {
  open: boolean;
  onClose: () => void;
  windowDays: AttributionWindow;
  canChange: boolean;
  isRebuilding: boolean;
};

export function HowDaklyCountsOrders({
  open,
  onClose,
  windowDays,
  canChange,
  isRebuilding,
}: Props) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      width="wide"
      title="How Dakly counts orders"
      description="Which orders show up as money from your marketing."
    >
      <div className="space-y-6">
        <section className="space-y-2">
          <h3 className="font-semibold">The rule</h3>
          <p>
            When a customer orders, Dakly looks back over your window for the messages and posts
            that customer read or tapped. The last one gets the credit. Each order is credited to
            one message or post at most.
          </p>
        </section>

        <WindowChoice windowDays={windowDays} canChange={canChange} isRebuilding={isRebuilding} />

        <Example windowDays={windowDays} />

        <section className="space-y-2">
          <h3 className="font-semibold">What is not counted</h3>
          <ul className="list-disc space-y-1 pl-5">
            {notCounted.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </div>
    </Sheet>
  );
}

function WindowChoice({
  windowDays,
  canChange,
  isRebuilding,
}: Pick<Props, 'windowDays' | 'canChange' | 'isRebuilding'>) {
  const change = useChangeAttributionWindow();
  return (
    <section className="space-y-2">
      <h3 className="font-semibold">Your window</h3>
      {canChange ? (
        <fieldset className="space-y-2" disabled={change.isPending || isRebuilding}>
          <legend className="sr-only">Counting window</legend>
          <div className="flex flex-wrap gap-2">
            {windows.map((days) => (
              <label
                key={days}
                className={cn(
                  'flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-input-border px-4',
                  windowDays === days && 'border-action bg-primary-soft font-medium',
                )}
              >
                <input
                  type="radio"
                  name="counting-window"
                  checked={windowDays === days}
                  onChange={() => change.mutate(days)}
                  className="accent-action"
                />
                {days === 1 ? '1 day' : `${days} days`}
              </label>
            ))}
          </div>
          <p className="text-sm text-text-muted">
            Changing it recounts the last 365 days. This can take a few minutes.
          </p>
        </fieldset>
      ) : (
        <p>
          Your window is {windowDays} {windowDays === 1 ? 'day' : 'days'}. Only the owner can change
          it.
        </p>
      )}
      {change.isError && (
        <p role="alert" className="text-sm text-danger">
          The window was not changed. Try again.
        </p>
      )}
    </section>
  );
}

function Example({ windowDays }: { windowDays: AttributionWindow }) {
  return (
    <section className="space-y-2">
      <h3 className="font-semibold">An example</h3>
      <ol className="space-y-1 border-l-2 border-border pl-4">
        <li>Day 1: the customer reads your WhatsApp campaign.</li>
        <li>Day 3: the customer taps the link in your SMS campaign.</li>
        <li>Day 5: the customer orders.</li>
      </ol>
      <p>
        {windowDays === 1
          ? 'With a 1-day window, neither campaign gets the order. The last tap was 2 days before it. The order still shows in Orders, not in money from marketing.'
          : `With a ${windowDays}-day window, the SMS campaign gets the order because it was the last one the customer tapped. The WhatsApp campaign does not.`}
      </p>
    </section>
  );
}
