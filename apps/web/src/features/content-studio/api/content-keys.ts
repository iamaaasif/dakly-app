const root = ['content-studio'] as const;

export const contentKeys = {
  all: (contextTag: string | undefined) => [...root, contextTag] as const,
  pieces: (contextTag: string | undefined) => [...root, contextTag, 'pieces'] as const,
  products: (contextTag: string | undefined) => [...root, contextTag, 'products'] as const,
};
