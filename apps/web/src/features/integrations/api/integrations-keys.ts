export const integrationsKeys = {
  all: ['integrations'] as const,
  connections: (tag: string | undefined) => ['integrations', 'connections', tag] as const,
  smsSenders: (tag: string | undefined) => ['integrations', 'sms-senders', tag] as const,
};
