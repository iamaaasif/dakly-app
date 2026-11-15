export const auditKeys = {
  search: (query: string) => ['staff-audit', query] as const,
  export: (id: string | undefined) => ['staff-audit-export', id] as const,
};
