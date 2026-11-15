export const supportKeys = {
  requests: ['support-requests'] as const,
  requestPage: (before: string) => ['support-requests', before] as const,
  targets: (query: string) => ['support-targets', query] as const,
};
