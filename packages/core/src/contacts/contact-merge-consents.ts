import type { ConsentChannel, ConsentStatus } from '@dakly/contracts/contacts';

import type { ConsentState } from './contact-merge.repository';

export type ConsentAnswer = { channel: ConsentChannel; status: ConsentStatus };

// One person's answers combine to the most careful one: a withdrawal on either contact wins,
// otherwise an agreement on either counts. Only an answer that changes the kept contact is added.
export function planMergeConsents(kept: ConsentState[], merged: ConsentState[]): ConsentAnswer[] {
  const channels = new Set([...kept, ...merged].map(({ channel }) => channel));
  const answers: ConsentAnswer[] = [];
  for (const channel of channels) {
    const statuses = [kept, merged].map(
      (states) => states.find((state) => state.channel === channel)?.status,
    );
    const status = careful(statuses);
    const current = statuses[0];
    if (status && status !== current) answers.push({ channel, status });
  }
  return answers;
}

// Undo never grants consent. A withdrawal made on the kept contact since the merge also goes to the
// restored contact, and an agreement the merge itself copied over is taken back.
export function planUndoConsents(input: {
  kept: ConsentState[];
  merged: ConsentState[];
  mergedAt: Date;
  appended: ConsentAnswer[];
}) {
  const forKept: ConsentAnswer[] = [];
  const forMerged: ConsentAnswer[] = [];
  for (const state of input.kept) {
    const own = input.merged.find(({ channel }) => channel === state.channel)?.status;
    if (state.status === 'withdrawn' && state.capturedAt >= input.mergedAt && own !== 'withdrawn')
      forMerged.push({ channel: state.channel, status: 'withdrawn' });
    const copied = input.appended.some(
      ({ channel, status }) => channel === state.channel && status === 'granted',
    );
    if (
      copied &&
      state.status === 'granted' &&
      state.capturedAt.getTime() === input.mergedAt.getTime()
    )
      forKept.push({ channel: state.channel, status: 'not_answered' });
  }
  return { forKept, forMerged };
}

function careful(statuses: (ConsentStatus | undefined)[]): ConsentStatus | undefined {
  if (statuses.includes('withdrawn')) return 'withdrawn';
  return statuses.includes('granted') ? 'granted' : undefined;
}
