import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const CONTACT_ERRORS = {
  CONTACT_NOT_FOUND: { status: 404, message: 'Contact not found' },
  // Says nothing about the other contact: a member may not be allowed to see who has the number.
  CONTACT_PHONE_TAKEN: {
    status: 409,
    message: 'A contact with this phone number already exists',
  },
  MATCH_SUGGESTION_NOT_FOUND: { status: 404, message: 'Possible match not found' },
  CONTACT_MERGE_SAME_CONTACT: { status: 400, message: 'Choose two different customers to merge' },
  // Two chats on one page cannot share a customer yet, so neither is changed.
  CONTACT_MERGE_CHAT_CONFLICT: {
    status: 409,
    message: 'Both customers have a chat on the same page. Merge is not available for them yet',
  },
  // The newer customer would disappear with its baki, which cannot move to the other one.
  CONTACT_MERGE_HAS_DUE: {
    status: 409,
    message: 'The newer customer has baki entries. Merge is not available for them yet',
  },
  CONTACT_MERGE_NOT_FOUND: { status: 404, message: 'Merge not found' },
  CONTACT_MERGE_UNDO_CLOSED: {
    status: 409,
    message: 'This merge can no longer be undone',
  },
  CONTACT_MERGE_UNDO_BLOCKED: {
    status: 409,
    message: 'Undo the later merge of these customers first',
  },
  CONTACT_SEARCH_TOO_SHORT: { status: 400, message: 'Type at least 3 letters to search by name' },
  CONTACT_PHONE_RATE_LIMITED: {
    status: 429,
    message: 'Too many phone searches or changes. Try again later',
  },
  CONTACT_ERASE_NOT_ALLOWED: { status: 403, message: 'Only the owner can erase a customer' },
  CONTACT_EXPORT_NOT_ALLOWED: { status: 403, message: 'You cannot download customer lists' },
  CONTACT_EXPORT_TOO_LARGE: {
    status: 422,
    message: 'Too many customers to download at once. Narrow the filters',
  },
} as const satisfies ErrorCatalog;

export function contactError(code: keyof typeof CONTACT_ERRORS): AppError {
  return new AppError(code, CONTACT_ERRORS[code]);
}
