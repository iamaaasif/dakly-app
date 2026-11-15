import { describe, expect, it } from 'vitest';

import { createRoleSchema, changeRoleSchema, roleListQuerySchema } from './team';

const permissions = {
  areas: { team: 'view' },
  seeFullPhone: false,
  exportLists: false,
  refund: false,
};
describe('role contracts', () => {
  it('trims names and requires bounded names and complete permissions', () => {
    expect(createRoleSchema.parse({ name: ' Reader ', permissions }).name).toBe('Reader');
    for (const name of ['', ' ', 'a'.repeat(61)])
      expect(createRoleSchema.safeParse({ name, permissions }).success).toBe(false);
    expect(createRoleSchema.safeParse({ name: 'Reader', permissions: { areas: {} } }).success).toBe(
      false,
    );
  });
  it('rejects Owner powers, unknown fields and empty changes', () => {
    expect(
      createRoleSchema.safeParse({
        name: 'Reader',
        permissions: { ...permissions, areas: { billing: 'edit' } },
      }).success,
    ).toBe(false);
    expect(changeRoleSchema.safeParse({}).success).toBe(false);
    expect(changeRoleSchema.safeParse({ name: 'Reader', storeId: 'fake' }).success).toBe(false);
    expect(changeRoleSchema.parse({ name: 'Renamed' })).toEqual({ name: 'Renamed' });
  });
  it('bounds role pages', () => {
    expect(roleListQuerySchema.parse({})).toEqual({ limit: 50 });
    for (const query of [{ limit: 101 }, { limit: 0 }, { cursor: 'owner' }, { storeId: 'fake' }])
      expect(roleListQuerySchema.safeParse(query).success).toBe(false);
  });
});
