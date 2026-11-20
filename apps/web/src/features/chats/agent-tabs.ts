export const agentTabs = ['settings', 'knowledge'] as const;
export type AgentTab = (typeof agentTabs)[number];
