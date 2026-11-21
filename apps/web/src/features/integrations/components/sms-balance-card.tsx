'use client';
import { formatCount } from '@dakly/contracts/money';
import { Badge } from '@dakly/ui/badge';

import { useSmsBalance } from '@/lib/sms-balance';

const LOW_BALANCE = 500;
// A Bangla text over 70 characters splits into 67-character parts and one part costs one credit,
// so a typical 100 to 130 character offer uses two.
const CREDITS_PER_BANGLA_MESSAGE = 2;

// A member without the billing permission gets a refusal, and the card is left out.
export function SmsBalanceCard() {
  const balance = useSmsBalance(true);
  if (!balance.data) return null;
  const { smsCredits } = balance.data;
  return (
    <section
      aria-labelledby="sms-balance-heading"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-4 md:p-6"
    >
      <div className="min-w-48 flex-1">
        <h2 id="sms-balance-heading" className="text-lg font-semibold">
          SMS balance
        </h2>
        <p className="text-2xl font-semibold">{formatCount(smsCredits)} SMS</p>
        <p className="text-sm text-text-muted">
          About {formatCount(Math.floor(smsCredits / CREDITS_PER_BANGLA_MESSAGE))} Bangla messages
        </p>
      </div>
      {smsCredits < LOW_BALANCE ? <Badge variant="warning">Low</Badge> : null}
    </section>
  );
}
