export const settingsKeys = {
  all: ['store-settings'] as const,
  store: (tag: string | undefined) => ['store-settings', tag] as const,
};
