export const agentTabs = ['settings', 'knowledge', 'test'] as const;
export type AgentTab = (typeof agentTabs)[number];
