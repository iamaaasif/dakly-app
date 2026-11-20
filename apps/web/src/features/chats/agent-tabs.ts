export const agentTabs = ['settings', 'knowledge', 'feedback', 'test'] as const;
export type AgentTab = (typeof agentTabs)[number];
