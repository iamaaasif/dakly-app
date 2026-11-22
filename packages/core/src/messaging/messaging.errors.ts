import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const MESSAGING_ERRORS = {
  CHATS_DISABLED: { status: 403, message: 'Enable Chats to open the inbox' },
  AI_REPLY_NOT_FOUND: { status: 404, message: 'AI reply not found' },
  AI_REPLY_NOT_BAD: { status: 409, message: 'Only a reply rated bad can be fixed' },
  AI_REPLY_ALREADY_FIXED: { status: 409, message: 'This reply is already fixed' },
  CONVERSATION_NOT_FOUND: { status: 404, message: 'Conversation not found' },
  CONVERSATION_REPLY_UNSUPPORTED: {
    status: 422,
    message: 'Replies to this channel are not available yet',
  },
  CONVERSATION_REPLY_BLOCKED: {
    status: 409,
    message: 'This customer cannot be messaged now. Their reply window may be closed',
  },
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
  ATTACHMENT_COPY_UNAVAILABLE: { status: 503, message: 'The attachment could not be copied yet' },
  MEDIA_READING_UNAVAILABLE: {
    status: 503,
    message: 'The photo or voice note could not be read yet',
  },
  MESSAGE_ARCHIVE_INCOMPLETE: {
    status: 500,
    message: 'A message archive object was not stored completely',
  },
  MESSAGE_ARCHIVE_COUNT_CHANGED: {
    status: 500,
    message: 'A conversation month changed while it was archived',
  },
  // A provider call inside a store transaction would hold its connection and locks.
  MESSAGING_INSIDE_TRANSACTION: { status: 500, message: 'Something went wrong' },
} as const satisfies ErrorCatalog;

export function messagingError(code: keyof typeof MESSAGING_ERRORS): AppError {
  return new AppError(code, MESSAGING_ERRORS[code]);
}
