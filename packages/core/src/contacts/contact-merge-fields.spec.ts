import { describe, expect, it } from 'vitest';

import { planFieldMerge, planFieldUndo, type ContactFields } from './contact-merge-fields';

const base: ContactFields = {
  name: null,
  phone: null,
  phoneVerifiedAt: null,
  whatsappPhone: null,
  email: null,
  gender: null,
  birthdayDay: null,
  birthdayMonth: null,
  birthYear: null,
  notes: null,
  address: null,
  district: null,
  bdAreaId: null,
  kind: 'lead',
  notCustomerReason: null,
  isBlocked: false,
  tags: [],
  updatedAt: new Date('2026-11-01T00:00:00Z'),
};

describe('planFieldMerge', () => {
  it('keeps what the kept contact has and fills only empty fields', () => {
    const plan = planFieldMerge(
      { ...base, name: 'রিনা', email: null },
      { ...base, name: 'Rina A', email: 'rina@example.test', notes: 'Eid order' },
    );
    expect(plan.after).toEqual({ email: 'rina@example.test', notes: 'Eid order' });
    expect(plan.before).toEqual({ email: null, notes: null });
  });

  it('takes the newer address as one group and combines tags', () => {
    const plan = planFieldMerge(
      { ...base, address: 'Old road', district: 'Dhaka', tags: ['eid'] },
      {
        ...base,
        address: 'New road',
        district: 'Gazipur',
        tags: ['vip'],
        updatedAt: new Date('2026-11-10T00:00:00Z'),
      },
    );
    expect(plan.after).toMatchObject({
      address: 'New road',
      district: 'Gazipur',
      bdAreaId: null,
      tags: ['eid', 'vip'],
    });
  });

  it('never carries a verified time without its phone', () => {
    const when = new Date('2026-11-05T00:00:00Z');
    const plan = planFieldMerge(
      { ...base, phone: '01710000001' },
      { ...base, phone: '01710000002', phoneVerifiedAt: when },
    );
    expect(plan.after).toEqual({});
  });
});

describe('planFieldUndo', () => {
  it('restores a field that still holds the merged value and reports a later edit by name', () => {
    const plan = planFieldUndo(
      { ...base, email: 'edited@example.test', notes: 'Eid order', tags: ['eid', 'vip', 'late'] },
      { email: null, notes: null, tags: ['eid'] },
      { email: 'rina@example.test', notes: 'Eid order', tags: ['eid', 'vip'] },
    );
    expect(plan.conflicts).toEqual(['email']);
    expect(plan.restore).toEqual({ notes: null, tags: ['eid', 'late'] });
  });

  it('restores linked fields together or not at all', () => {
    const plan = planFieldUndo(
      { ...base, address: 'Changed later', district: 'Gazipur' },
      { address: null, district: null, bdAreaId: null },
      { address: 'New road', district: 'Gazipur', bdAreaId: null },
    );
    expect(plan.restore).toEqual({});
    expect(plan.conflicts).toEqual(['address']);
  });
});
