import { describe, expect, it } from 'vitest';

import { customerColumnsParam, parseCustomerColumns } from './customer-columns';

describe('customer columns in the address', () => {
  it('shows Phone and WhatsApp when the address names no columns', () => {
    expect(parseCustomerColumns(undefined)).toEqual(['phone', 'whatsapp']);
  });

  it('shows none when the address names none', () => {
    expect(parseCustomerColumns('')).toEqual([]);
  });

  it('keeps the picker order and drops names it does not know', () => {
    expect(parseCustomerColumns('consent,bogus,email')).toEqual(['email', 'consent']);
  });

  it('leaves the defaults out of the address and keeps any other choice', () => {
    expect(customerColumnsParam(['phone', 'whatsapp'])).toBeUndefined();
    expect(customerColumnsParam([])).toBe('');
    expect(customerColumnsParam(['phone', 'tags'])).toBe('phone,tags');
  });
});
