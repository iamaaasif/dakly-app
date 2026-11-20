import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const AI_AGENT_SETTINGS_ERRORS = {
  AI_AGENT_SETTINGS_CHANGED: {
    status: 409,
    message: 'The AI agent settings changed since you opened them',
  },
} as const satisfies ErrorCatalog;

export function agentSettingsError(code: keyof typeof AI_AGENT_SETTINGS_ERRORS) {
  return new AppError(code, AI_AGENT_SETTINGS_ERRORS[code]);
}
