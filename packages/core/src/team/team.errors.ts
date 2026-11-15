import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const TEAM_ERRORS = {
  TRANSFER_NOT_FOUND: { status: 404, message: 'Ownership transfer not found' },
  TRANSFER_INVALID: { status: 400, message: 'This ownership transfer is no longer available' },
  TRANSFER_EXISTS: { status: 409, message: 'An ownership transfer is already pending' },
  TRANSFER_DENIED: { status: 403, message: 'This ownership transfer is not allowed' },
  TRANSFER_IDENTITY_REQUIRED: { status: 403, message: 'Verify your phone or email first' },
  TRANSFER_PROOF_INVALID: { status: 400, message: 'Request a new ownership transfer code' },
  TRANSFER_STORE_LIMIT: { status: 409, message: 'This member already owns a store' },
  ROLE_IN_USE: { status: 409, message: 'This role is still assigned to a membership' },
  ROLE_NAME_EXISTS: { status: 409, message: 'A role with this name already exists' },
  MEMBER_NOT_FOUND: { status: 404, message: 'Member not found' },
  ROLE_NOT_FOUND: { status: 404, message: 'Role not found' },
  TEAM_ROLE_DENIED: { status: 403, message: 'This role change is not allowed' },
  TEAM_SEATS_FULL: { status: 409, message: 'Your plan has no available team seats' },
  MEMBER_ALREADY_ACTIVE: { status: 409, message: 'This account is already a member' },
  INVITE_EXISTS: {
    status: 409,
    message: 'An invite exists with another role; change its role explicitly',
  },
  INVITE_INVALID: { status: 400, message: 'This invite is expired, cancelled or already accepted' },
  INVITE_WRONG_ACCOUNT: {
    status: 403,
    message: 'Sign in with the verified phone or email that was invited',
  },
  INVITE_RATE_LIMITED: { status: 429, message: 'Wait before sending another invite' },
  INVITE_DELIVERY_UNAVAILABLE: {
    status: 503,
    message: 'The invite was saved but delivery failed. Find it in Team and resend it.',
  },
} as const satisfies ErrorCatalog;
export function teamError(code: keyof typeof TEAM_ERRORS): AppError {
  return new AppError(code, TEAM_ERRORS[code]);
}
