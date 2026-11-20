import type { BuiltInRole } from '@dakly/contracts/team';

export const roleLabels: Record<BuiltInRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  support_agent: 'Support agent',
  marketer: 'Marketer',
};

export const builtInRoleDescriptions: Record<BuiltInRole, string> = {
  owner: 'Full access, including billing and closing the store. There is always one owner.',
  admin: 'Runs the store day to day. Everything except billing.',
  marketer: 'Creates campaigns, posts and automations, and sees the results.',
  support_agent: 'Replies to customers in Chats and checks their orders.',
};
