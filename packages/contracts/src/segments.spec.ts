import { describe, expect, it } from 'vitest';

import { type SegmentCondition, type SegmentGroup, segmentRulesSchema } from './segments';

const dhaka: SegmentCondition = { field: 'district', operator: 'is_any_of', values: ['ঢাকা'] };

function nested(levels: number): SegmentGroup {
  return levels === 1
    ? { match: 'all', conditions: [dhaka] }
    : { match: 'any', conditions: [dhaka, nested(levels - 1)] };
}

describe('segmentRulesSchema', () => {
  it('accepts groups three levels deep', () => {
    expect(segmentRulesSchema.safeParse(nested(3)).success).toBe(true);
  });

  it('refuses groups four levels deep', () => {
    expect(segmentRulesSchema.safeParse(nested(4)).success).toBe(false);
  });

  it('refuses 1,000 nested groups without overflowing the stack', () => {
    let rules: object = { match: 'all', conditions: [dhaka] };
    for (let level = 1; level < 1000; level += 1) rules = { match: 'all', conditions: [rules] };
    expect(JSON.stringify(rules).length).toBeGreaterThan(30_000);
    expect(segmentRulesSchema.safeParse(rules).success).toBe(false);
  });

  it('counts conditions across groups and refuses the 21st', () => {
    const ten = { match: 'all', conditions: Array.from({ length: 10 }, () => dhaka) } as const;
    expect(segmentRulesSchema.safeParse({ match: 'any', conditions: [ten, ten] }).success).toBe(
      true,
    );
    const result = segmentRulesSchema.safeParse({ match: 'any', conditions: [ten, ten, dhaka] });
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      'A segment can have at most 20 conditions',
    ]);
  });

  it('refuses an empty group, an unknown field and a not a customer kind', () => {
    for (const rules of [
      { match: 'all', conditions: [] },
      { match: 'all', conditions: [{ field: 'phone', operator: 'is_any_of', values: ['017'] }] },
      {
        match: 'all',
        conditions: [{ field: 'kind', operator: 'is_any_of', values: ['not_customer'] }],
      },
    ])
      expect(segmentRulesSchema.safeParse(rules).success).toBe(false);
  });

  it('lists order fields with their own operators', () => {
    const rules = {
      match: 'all',
      conditions: [
        { field: 'orders_count', operator: 'between', min: 2, max: 5 },
        { field: 'last_order_at', operator: 'in_last_days', days: 30 },
      ],
    };
    expect(segmentRulesSchema.parse(rules)).toEqual(rules);
  });
});
