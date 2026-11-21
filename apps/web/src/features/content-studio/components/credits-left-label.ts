import { formatCount } from '@dakly/contracts/money';

export function creditsLeftLabel(remaining: number): string {
  return `${formatCount(remaining)} AI ${remaining === 1 ? 'credit' : 'credits'} left`;
}
