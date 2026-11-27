import { describe, expect, it } from 'vitest';

import { type SegmentCondition, segmentListQuerySchema, segmentRulesSchema } from './segments';

const dhaka: SegmentCondition = { field: 'district', operator: 'is_any_of', values: ['ঢাকা'] };

function nested(levels: number): object {
  return levels === 1
    ? { match: 'all', conditions: [dhaka] }
    : { match: 'any', conditions: [dhaka, nested(levels - 1)] };
}

describe('segmentRulesSchema', () => {
  it('accepts a top group with groups inside it', () => {
    expect(segmentRulesSchema.safeParse(nested(2)).success).toBe(true);
  });

  it('refuses a group inside a group inside the top group', () => {
    expect(segmentRulesSchema.safeParse(nested(3)).success).toBe(false);
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
      { match: 'all', conditions: [{ field: 'orders_count', operator: 'more_than', value: 2 }] },
      {
        match: 'all',
        conditions: [{ field: 'kind', operator: 'is_any_of', values: ['not_customer'] }],
      },
    ])
      expect(segmentRulesSchema.safeParse(rules).success).toBe(false);
  });
});

describe('segmentListQuerySchema', () => {
  it('lists every segment by default and trims the search', () => {
    expect(segmentListQuerySchema.parse({})).toMatchObject({ status: 'all', limit: 50 });
    expect(segmentListQuerySchema.parse({ status: 'archived', search: '  ঈদ ' })).toMatchObject({
      status: 'archived',
      search: 'ঈদ',
    });
  });

  it('refuses an unknown status and a blank search', () => {
    expect(segmentListQuerySchema.safeParse({ status: 'deleted' }).success).toBe(false);
    expect(segmentListQuerySchema.safeParse({ search: '   ' }).success).toBe(false);
  });
});
