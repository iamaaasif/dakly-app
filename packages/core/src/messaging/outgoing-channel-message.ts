import type { SendCategory } from '../sending/send-policy.service';

export type OutgoingChannelMessage = {
  channel: 'messenger' | 'instagram';
  contactId: string;
  connectionId: string;
  identityId: string;
  category: Extract<SendCategory, 'staff_reply' | 'transactional' | 'marketing'>;
  content: string;
  operationKey: string;
  // A stored photo sent before the text, such as a product photo chosen by the AI.
  image?: { objectKey: string; contentType: string; sizeBytes: number };
  // Which tool results the AI reply came from, saved on the message for staff review.
  aiSources?: { tool: string; refs: string[] }[];
  actor: { kind: 'user'; userId: string } | { kind: 'ai'; aiRunId: string } | { kind: 'system' };
};
