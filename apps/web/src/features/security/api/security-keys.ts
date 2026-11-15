export const securityKeys = {
  account: ['account-security'] as const,
  profile: (tag: string | undefined) => ['account-security', tag, 'profile'] as const,
  devices: (tag: string | undefined, before?: string) =>
    ['account-security', tag, 'devices', before] as const,
  history: ['security-history'] as const,
  historyPage: (tag: string | undefined, before: string) =>
    ['security-history', tag, before] as const,
};
