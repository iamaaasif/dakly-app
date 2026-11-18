import { AppError, type ErrorCatalog } from '../../platform/errors/app-error';

const KNOWLEDGE_ERRORS = {
  KNOWLEDGE_ITEM_NOT_FOUND: { status: 404, message: 'Knowledge item not found' },
  KNOWLEDGE_FILE_NOT_FOUND: { status: 404, message: 'Knowledge file not found' },
  KNOWLEDGE_FILE_TYPE_INVALID: { status: 400, message: 'Choose a PDF or plain text file' },
} as const satisfies ErrorCatalog;

export function knowledgeError(code: keyof typeof KNOWLEDGE_ERRORS): AppError {
  return new AppError(code, KNOWLEDGE_ERRORS[code]);
}
