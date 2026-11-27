import type { AgentSettingsResponse } from '@dakly/contracts/ai-agent-settings';

export function formValues({ handoverRulesSaved: _saved, ...values }: AgentSettingsResponse) {
  return values;
}
