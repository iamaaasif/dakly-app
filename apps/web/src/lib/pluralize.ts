import { formatCount } from '@dakly/contracts/money';

export function pluralize(count: number, noun: string) {
  return `${formatCount(count)} ${noun}${count === 1 ? '' : 's'}`;
}
