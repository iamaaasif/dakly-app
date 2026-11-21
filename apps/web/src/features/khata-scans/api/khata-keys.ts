export const khataKeys = {
  all: ['khata-scans'] as const,
  page: (tag: string | undefined, pageId: string) => ['khata-scans', tag, 'page', pageId] as const,
  suggested: (tag: string | undefined, contactId: string) =>
    ['khata-scans', tag, 'suggested', contactId] as const,
  imports: (tag: string | undefined) => ['khata-scans', tag, 'imports'] as const,
};
