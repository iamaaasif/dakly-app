import { describe, expect, it } from 'vitest';

import {
  defaultAgentAbilities,
  defaultHandoverRules,
  type AgentSettingsResponse,
} from '@dakly/contracts/ai-agent-settings';
import type { ChannelConnection } from '@dakly/contracts/channels';

import { aiBlockers } from './ai-blockers';

const settings: AgentSettingsResponse = {
  version: 1,
  isAutoReplyOn: true,
  replyLanguage: 'match_customer',
  abilities: defaultAgentAbilities,
  handoverRules: defaultHandoverRules,
  returnToAiMinutes: 60,
  extraRules: null,
  handoverRulesSaved: true,
};
const usage = { allowance: 300, remaining: 120, periodEnd: '2026-12-01T00:00:00.000Z' };
const channel = (isAiLive: boolean): ChannelConnection => ({
  id: 'c1',
  kind: 'facebook_page',
  displayName: 'Page',
  externalAccountId: '1',
  status: 'active',
  isAiLive,
  tokenExpiresAt: null,
  connectedAt: '2026-11-01T00:00:00.000Z',
  disconnectedAt: null,
});

describe('why the AI is not live', () => {
  it('is empty when everything is on and live', () => {
    expect(aiBlockers(settings, [channel(true)], usage)).toEqual([]);
  });

  it('names every reason for a new shop on the free plan', () => {
    expect(
      aiBlockers({ ...settings, isAutoReplyOn: false }, [channel(false)], {
        ...usage,
        allowance: 0,
        remaining: 0,
      }),
    ).toEqual(['plan_limit', 'auto_reply_off', 'practice_mode']);
  });

  it('says nothing while the answers have not loaded', () => {
    expect(aiBlockers(undefined, undefined, undefined)).toEqual([]);
  });

  it('does not call a shop with no connected channel practice mode', () => {
    expect(aiBlockers(settings, [], usage)).toEqual([]);
  });
});
