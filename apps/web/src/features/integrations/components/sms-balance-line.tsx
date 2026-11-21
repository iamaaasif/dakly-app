'use client';
import { formatCount } from '@dakly/contracts/money';
import { Badge } from '@dakly/ui/badge';

import { useSmsBalance } from '@/lib/sms-balance';

const LOW_BALANCE = 500;
// A Bangla text over 70 characters splits into 67-character parts and one part costs one credit,
// so a typical 100 to 130 character offer uses two.
const CREDITS_PER_BANGLA_MESSAGE = 2;

// A member without the billing permission gets a refusal, and the line is left out.
export function SmsBalanceLine() {
  const balance = useSmsBalance(true);
  if (!balance.data) return null;
  const { smsCredits } = balance.data;
  const bangla = formatCount(Math.floor(smsCredits / CREDITS_PER_BANGLA_MESSAGE));
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
      <span>
        SMS balance: <span className="font-semibold text-text">{formatCount(smsCredits)} SMS</span>{' '}
        · About {bangla} Bangla messages
      </span>
      {smsCredits < LOW_BALANCE ? <Badge variant="warning">Low</Badge> : null}
    </p>
  );
}
