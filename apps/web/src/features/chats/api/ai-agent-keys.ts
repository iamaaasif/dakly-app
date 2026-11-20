export const aiAgentKeys = {
  all: ['ai-agent'] as const,
  settings: (tag: string | undefined) => ['ai-agent', tag, 'settings'] as const,
  testQuestions: (tag: string | undefined) => ['ai-agent', tag, 'test-questions'] as const,
  knowledge: (tag: string | undefined) => ['ai-agent', tag, 'knowledge'] as const,
  feedback: (tag: string | undefined) => ['ai-agent', tag, 'feedback'] as const,
  channels: (tag: string | undefined) => ['ai-agent', tag, 'channels'] as const,
};
