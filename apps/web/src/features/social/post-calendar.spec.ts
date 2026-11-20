import { expect, it } from 'vitest';

import type { PostResponse } from '@dakly/contracts/social';

import type { SocialAccount } from './api/get-social-accounts';
import { buildEntries, monthWeeks, shiftMonth, sortPublished, weekOf } from './post-calendar';

const facebook = { id: 'fb', kind: 'facebook_page', status: 'active' } as SocialAccount;
const instagram = { id: 'ig', kind: 'instagram', status: 'needs_reconnect' } as SocialAccount;

function post(overrides: Partial<PostResponse['targets'][number]>[], media = ['photo']) {
  return {
    id: 'p',
    mediaFileIds: media,
    targets: overrides.map((target) => ({
      channelConnectionId: 'fb',
      status: 'scheduled',
      scheduledFor: '2026-11-07T14:30:00.000Z',
      publishedAt: null,
      reach: null,
      reactions: null,
      comments: null,
      linkTaps: null,
      ...target,
    })),
  } as PostResponse;
}

it('starts every week on Saturday and covers the whole month', () => {
  expect(weekOf('2026-11-06')).toEqual([
    '2026-10-31',
    '2026-11-01',
    '2026-11-02',
    '2026-11-03',
    '2026-11-04',
    '2026-11-05',
    '2026-11-06',
  ]);
  const weeks = monthWeeks('2026-11');
  expect(weeks).toHaveLength(5);
  expect(weeks[0]?.[0]).toBe('2026-10-31');
  expect(weeks[4]?.[6]).toBe('2026-12-04');
  expect(shiftMonth('2026-12', 1)).toBe('2027-01');
});

it('places a late-evening post on its Dhaka day and merges its accounts into one entry', () => {
  const [entry] = buildEntries(
    [post([{}, { channelConnectionId: 'ig', status: 'scheduled' }])],
    [facebook, { ...instagram, status: 'active' }],
    null,
  );
  expect(entry).toMatchObject({
    dayKey: '2026-11-07',
    status: 'scheduled',
    kinds: ['facebook_page', 'instagram'],
  });
  expect(
    buildEntries([post([{ scheduledFor: '2026-11-07T19:00:00.000Z' }])], [facebook], null)[0]
      ?.dayKey,
  ).toBe('2026-11-08');
});

it('flags a post whose account needs reconnecting or whose Instagram post has no photo', () => {
  const expired = post([{ channelConnectionId: 'ig' }]);
  expect(buildEntries([expired], [instagram], null)[0]?.status).toBe('needs_attention');
  const noPhoto = post([{ channelConnectionId: 'ig' }], []);
  expect(buildEntries([noPhoto], [{ ...instagram, status: 'active' }], null)[0]?.status).toBe(
    'needs_attention',
  );
});

it('shows a failed target as Failed and filters by account', () => {
  const mixed = post([{}, { channelConnectionId: 'ig', status: 'failed' }]);
  expect(buildEntries([mixed], [facebook, instagram], null)[0]?.status).toBe('failed');
  expect(buildEntries([mixed], [facebook, instagram], 'fb')[0]?.status).toBe('scheduled');
  expect(buildEntries([mixed], [facebook, instagram], 'other')).toEqual([]);
});

it('sorts published posts by newest, reach or reactions, with unmeasured posts last', () => {
  const entry = (id: string, at: string, [reach, reactions]: (number | null)[]) => {
    const [built] = buildEntries(
      [{ ...post([{ status: 'published', publishedAt: at, reach, reactions }]), id }],
      [facebook],
      null,
    );
    return built!;
  };
  const entries = [
    entry('old', '2026-11-01T10:00:00.000Z', [900, 5]),
    entry('new', '2026-11-05T10:00:00.000Z', [null, null]),
    entry('mid', '2026-11-03T10:00:00.000Z', [100, 50]),
  ];
  const ids = (sort: 'newest' | 'reach' | 'reactions') =>
    sortPublished(entries, sort).map(({ post: { id } }) => id);
  expect(ids('newest')).toEqual(['new', 'mid', 'old']);
  expect(ids('reach')).toEqual(['old', 'mid', 'new']);
  expect(ids('reactions')).toEqual(['mid', 'old', 'new']);
});
