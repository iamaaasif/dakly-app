export const aiTiers = ['reply', 'fast', 'vision', 'writer', 'embed', 'transcribe'] as const;
export const aiRunPurposes = [
  'chat_reply',
  'classify',
  'comment_reply',
  'summary',
  'transcribe',
  'describe_image',
  'content',
  'ask',
  'segment_rules',
  'voice_add',
  'teach',
  'embedding',
] as const;
export const aiRunOutcomes = [
  'completed',
  'sent',
  'handed_over',
  'failed_check',
  'failed',
  'timeout',
] as const;
export const knowledgeKinds = ['faq', 'policy', 'taught', 'file', 'url'] as const;
export const knowledgeStatuses = ['processing', 'active', 'failed', 'archived'] as const;
export const replyLanguages = ['match_customer', 'bn', 'en'] as const;
export const assistantRoles = ['user', 'assistant'] as const;
