export function BillingCycle({
  cycle,
  chooseCycle,
}: {
  cycle: 'monthly' | 'yearly';
  chooseCycle: (value: 'monthly' | 'yearly') => void;
}) {
  return (
    <fieldset className="flex gap-4">
      <legend className="font-medium">Billing cycle</legend>
      {(['monthly', 'yearly'] as const).map((value) => (
        <label key={value} className="flex min-h-10 items-center gap-2">
          <input
            type="radio"
            name="billingCycle"
            checked={cycle === value}
            onChange={() => chooseCycle(value)}
          />
          {value === 'monthly' ? 'Monthly' : 'Yearly'}
        </label>
      ))}
    </fieldset>
  );
}
