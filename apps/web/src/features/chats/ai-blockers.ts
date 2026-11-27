import type { AgentSettingsResponse, AgentUsageResponse } from '@dakly/contracts/ai-agent-settings';
import type { ChannelConnection } from '@dakly/contracts/channels';

import { useAgentSettings, useAgentUsage } from './api/agent-settings';
import { useChatChannels } from './api/chat-channels';

export type AiBlocker = 'plan_limit' | 'auto_reply_off' | 'practice_mode';

// Only a loaded answer counts: a failed or pending request must not tell the seller the AI is off.
export function aiBlockers(
  settings: AgentSettingsResponse | undefined,
  channels: ChannelConnection[] | undefined,
  usage: AgentUsageResponse | undefined,
): AiBlocker[] {
  const blockers: AiBlocker[] = [];
  if (usage && usage.remaining === 0) blockers.push('plan_limit');
  if (settings && !settings.isAutoReplyOn) blockers.push('auto_reply_off');
  const connected = channels?.filter((channel) => channel.status !== 'disconnected');
  if (connected?.length && !connected.some((channel) => channel.isAiLive))
    blockers.push('practice_mode');
  return blockers;
}

export function useAiBlockers() {
  const settings = useAgentSettings();
  const channels = useChatChannels();
  const usage = useAgentUsage();
  return aiBlockers(settings.data, channels.data?.items, usage.data);
}
