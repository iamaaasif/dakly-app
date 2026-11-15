export const supportKeys = {
  ownerRequests: (tag: string | undefined) => ['owner-support', tag] as const,
  ownerRequestPage: (tag: string | undefined, before: string) =>
    ['owner-support', tag, before] as const,
  session: ['support-session'] as const,
  customers: (contextTag: string) => ['support-customer', contextTag] as const,
  customer: (contextTag: string, id: string) => ['support-customer', contextTag, id] as const,
};
