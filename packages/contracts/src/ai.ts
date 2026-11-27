export const aiTiers = [
  'reply',
  'fast',
  'vision',
  'handwriting',
  'writer',
  'embed',
  'transcribe',
] as const;
export const aiRunPurposes = [
  'chat_reply',
  'suggest_reply',
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
  'contact_memory',
  'grade_test',
  'tag_product_photo',
  'suggest_product_options',
  'khata_scan',
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
// What a taught rule or settings edit changed, so the owner can undo it.
export const aiRuleTargets = [
  'ai_agent_settings',
  'store_settings',
  'delivery_zone',
  'knowledge_item',
] as const;
export const aiRuleChangeSources = ['teach', 'settings_edit', 'undo'] as const;
