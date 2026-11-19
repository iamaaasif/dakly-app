import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const MESSAGING_ERRORS = {
  CHATS_DISABLED: { status: 403, message: 'Enable Chats to open the inbox' },
  CONVERSATION_NOT_FOUND: { status: 404, message: 'Conversation not found' },
  CONVERSATION_ASSIGNEE_INVALID: { status: 400, message: 'Choose an active team member' },
  MESSAGING_PREPARATION_FAILED: { status: 503, message: 'The message could not be prepared' },
  MESSAGING_CONTACT_HAS_NO_PHONE: { status: 422, message: 'This contact has no phone number' },
  MESSAGE_OPERATION_CONFLICT: {
    status: 409,
    message: 'This operation already used another message',
  },
  MESSAGING_DESTINATION_CHANGED: {
    status: 409,
    message: "The contact's phone changed after this message was decided",
  },
  // A provider call inside a store transaction would hold its connection and locks.
  MESSAGING_INSIDE_TRANSACTION: { status: 500, message: 'Something went wrong' },
} as const satisfies ErrorCatalog;

export function messagingError(code: keyof typeof MESSAGING_ERRORS): AppError {
  return new AppError(code, MESSAGING_ERRORS[code]);
}
