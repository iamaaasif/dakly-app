export const khataKeys = {
  all: ['khata-scans'] as const,
  imports: (tag: string | undefined) => ['khata-scans', tag, 'imports'] as const,
};
