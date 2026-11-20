// Each one is answered by a report tool, and shows only when the member's role can view that report.
export const askSuggestions = [
  { text: 'Which product sells best?', canAsk: 'canViewOrders' },
  { text: 'How much did I sell today?', canAsk: 'canViewOrders' },
  { text: 'How much did I sell this month?', canAsk: 'canViewOrders' },
  { text: 'How much did I sell yesterday?', canAsk: 'canViewOrders' },
  { text: 'How much did I sell in the last 30 days?', canAsk: 'canViewOrders' },
  { text: 'Explain my campaign performance', canAsk: 'canViewAnalytics' },
  { text: 'How many customers came back in the last 30 days?', canAsk: 'canViewCustomers' },
] as const;
