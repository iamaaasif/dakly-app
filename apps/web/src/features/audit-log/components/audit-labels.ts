import type { AuditLogItem } from '@dakly/contracts/audit';

const actionLabels: Record<string, string> = {
  'store.settings_changed': 'Store settings changed',
  'store.extensions_changed': 'Extensions changed',
  'store.created': 'Store created',
  'attribution.window_changed': 'Attribution window changed',
  'member.invited': 'Team member invited',
  'member.role_changed': 'Team member role changed',
  'order.stage_changed': 'Order stage changed',
  'order.edited': 'Order edited',
  'customer.created': 'Customer added',
  'contacts.exported': 'Customers exported',
  'sms_sender_id.approved': 'SMS sender name approved',
  'support.approved': 'Support access approved',
  'support.break_glass_opened': 'Dakly opened emergency read-only access',
};

const roleLabels: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Manager',
  marketer: 'Marketer',
  agent: 'Agent',
};

export function actionLabel(action: string): string {
  const known = actionLabels[action];
  if (known) return known;
  const words = action.replace(/[._]/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function actorLabel({ kind, isYou, role }: AuditLogItem['actor']): string {
  if (kind === 'staff') return 'Dakly support';
  if (kind === 'system') return 'Dakly';
  if (kind === 'ai') return 'Dakly AI';
  if (kind === 'customer') return 'A customer';
  const roleName = role ? (roleLabels[role] ?? 'Team member') : 'Former team member';
  return isYou ? `You (${roleName})` : roleName;
}
