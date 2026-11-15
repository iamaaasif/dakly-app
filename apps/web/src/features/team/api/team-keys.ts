export const teamKeys = {
  all: ['team'] as const,
  members: (tag: string | undefined, cursor?: string) => ['team', tag, 'members', cursor] as const,
  roles: (tag: string | undefined, cursor?: string) => ['team', tag, 'roles', cursor] as const,
  roleOptions: (tag: string | undefined) => ['team', tag, 'roles', undefined, 'options'] as const,
  transfer: (tag: string | undefined) => ['team', tag, 'transfer'] as const,
};
