import type { SendCategory } from '../sending/send-policy.service';

export type OutgoingChannelMessage = {
  channel: 'messenger' | 'instagram';
  contactId: string;
  connectionId: string;
  identityId: string;
  category: Extract<SendCategory, 'staff_reply' | 'transactional'>;
  content: string;
  operationKey: string;
  actor: { kind: 'user'; userId: string } | { kind: 'ai'; aiRunId: string } | { kind: 'system' };
};
