import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const AI_PRACTICE_ERRORS = {
  PRACTICE_TESTER_NOT_FOUND: { status: 404, message: 'A tester is not a contact of this store' },
  PRACTICE_AI_BUSY: { status: 503, message: 'The store has three AI calls in progress' },
  GO_LIVE_NEEDS_KNOWLEDGE: { status: 409, message: 'Add something to Knowledge before going live' },
  GO_LIVE_NEEDS_PRODUCTS: {
    status: 409,
    message: 'Add a product shown in chats before going live',
  },
  GO_LIVE_NEEDS_HANDOVER_RULES: {
    status: 409,
    message: 'Set the hand-over rules before going live',
  },
  GO_LIVE_NEEDS_TEST_QUESTIONS: {
    status: 409,
    message: 'Add at least 3 test questions before going live',
  },
  GO_LIVE_TESTS_FAILED: {
    status: 409,
    message: 'Some test questions did not get the expected answer',
  },
} as const satisfies ErrorCatalog;

export function practiceError(code: keyof typeof AI_PRACTICE_ERRORS, fields?: AppError['fields']) {
  return new AppError(code, AI_PRACTICE_ERRORS[code], fields);
}
