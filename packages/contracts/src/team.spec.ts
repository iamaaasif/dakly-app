import { describe, expect, it } from 'vitest';
import { customRolePermissionsSchema } from './team';

const permissions = {
  areas: { customers: 'edit', billing: 'view' },
  seeFullPhone: false,
  exportLists: false,
  refund: false,
};

describe('custom role permissions', () => {
  it('accepts a billing viewer and rejects billing changes', () => {
    expect(customRolePermissionsSchema.safeParse(permissions).success).toBe(true);
    expect(
      customRolePermissionsSchema.safeParse({ ...permissions, areas: { billing: 'edit' } }).success,
    ).toBe(false);
  });

  it.each([
    { areas: { invoices: 'view' } },
    { areas: { orders: 'delete' } },
    { refund: 'true' },
    { owner: true },
  ])('rejects invalid permission JSON %j', (invalid) => {
    expect(customRolePermissionsSchema.safeParse({ ...permissions, ...invalid }).success).toBe(
      false,
    );
  });
});
