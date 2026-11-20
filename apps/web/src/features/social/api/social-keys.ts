const root = ['social'] as const;

export const socialKeys = {
  accounts: (contextTag: string | undefined) => [...root, contextTag, 'accounts'] as const,
  drafts: (contextTag: string | undefined) => [...root, contextTag, 'drafts'] as const,
};
