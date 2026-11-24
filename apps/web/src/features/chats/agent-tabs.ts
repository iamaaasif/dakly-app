export const agentTabs = ['settings', 'knowledge', 'feedback', 'ads', 'test'] as const;
export type AgentTab = (typeof agentTabs)[number];
