export const aiAgentKeys = {
  all: ['ai-agent'] as const,
  settings: (tag: string | undefined) => ['ai-agent', tag, 'settings'] as const,
  testQuestions: (tag: string | undefined) => ['ai-agent', tag, 'test-questions'] as const,
  channels: (tag: string | undefined) => ['ai-agent', tag, 'channels'] as const,
};
