import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const CAMPAIGN_ERRORS = {
  CAMPAIGN_NOT_FOUND: { status: 404, message: 'Campaign not found' },
  CAMPAIGN_NOT_DRAFT: { status: 409, message: 'This campaign is no longer a draft' },
  CAMPAIGN_TEXT_EMPTY: { status: 409, message: 'Write the message before approving' },
  CAMPAIGN_SEND_TIME_PASSED: { status: 409, message: 'The send time has passed; choose a new one' },
  CAMPAIGN_NO_RECIPIENTS: { status: 409, message: 'No one in this audience can get this message' },
  CAMPAIGN_APPROVAL_DENIED: {
    status: 403,
    message: 'Only an owner or admin can approve sends in this shop',
  },
} as const satisfies ErrorCatalog;

export function campaignError(code: keyof typeof CAMPAIGN_ERRORS): AppError {
  return new AppError(code, CAMPAIGN_ERRORS[code]);
}
