import { describe, expect, it } from 'vitest';

import { planMergeConsents, planUndoConsents } from './contact-merge-consents';
import type { ConsentState } from './contact-merge.repository';

const at = new Date('2026-11-20T12:00:00Z');
const state = (
  channel: ConsentState['channel'],
  status: ConsentState['status'],
  capturedAt = at,
): ConsentState => ({ channel, status, capturedAt });

describe('planMergeConsents', () => {
  it('lets a withdrawal win and adds only answers that change the kept contact', () => {
    const answers = planMergeConsents(
      [state('sms', 'granted'), state('whatsapp', 'granted')],
      [state('sms', 'withdrawn'), state('whatsapp', 'granted'), state('messenger', 'granted')],
    );
    expect(answers).toEqual([
      { channel: 'sms', status: 'withdrawn' },
      { channel: 'messenger', status: 'granted' },
    ]);
  });
});

describe('planUndoConsents', () => {
  it('passes a later withdrawal to the restored contact and takes back an agreement it copied', () => {
    const later = new Date('2026-11-21T12:00:00Z');
    const plan = planUndoConsents({
      kept: [state('sms', 'withdrawn', later), state('messenger', 'granted', at)],
      merged: [state('sms', 'granted')],
      mergedAt: at,
      appended: [{ channel: 'messenger', status: 'granted' }],
    });
    expect(plan.forMerged).toEqual([{ channel: 'sms', status: 'withdrawn' }]);
    expect(plan.forKept).toEqual([{ channel: 'messenger', status: 'not_answered' }]);
  });
});
