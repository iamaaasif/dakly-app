import type { ValidationField } from '@dakly/contracts/errors';

import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const CAMPAIGN_ERRORS = {
  CAMPAIGN_NOT_FOUND: { status: 404, message: 'Campaign not found' },
  CAMPAIGN_NOT_DRAFT: { status: 409, message: 'This campaign is no longer a draft' },
  CAMPAIGN_TEXT_EMPTY: { status: 409, message: 'Write the message before approving' },
  CAMPAIGN_SEND_TIME_PASSED: { status: 409, message: 'The send time has passed; choose a new one' },
  CAMPAIGN_NO_RECIPIENTS: { status: 409, message: 'No one in this audience can get this message' },
  CAMPAIGN_NOT_SCHEDULED: { status: 409, message: 'This campaign is not scheduled' },
  CAMPAIGN_NOT_CANCELLABLE: { status: 409, message: 'This campaign has already finished' },
  CAMPAIGN_CHANGE_TOO_LATE: {
    status: 409,
    message: 'A campaign can be edited until 5 minutes before it sends',
  },
  CAMPAIGN_NOT_SENDING: { status: 409, message: 'This campaign is not sending' },
  CAMPAIGN_APPROVAL_TIME_MISSING: { status: 500, message: 'Campaign approval time is missing' },
  CAMPAIGN_NOT_PAUSED: { status: 409, message: 'This campaign is not paused' },
  CAMPAIGN_PAUSED_BY_SYSTEM: {
    status: 409,
    message: 'This campaign resumes on its own once the reason it paused is fixed',
  },
  CAMPAIGN_CHANGE_NOT_FOR_CHANNEL: {
    status: 400,
    message: 'That change does not fit this campaign’s channel',
  },
  CAMPAIGN_APPROVAL_DENIED: {
    status: 403,
    message: 'Only an owner or admin can approve sends in this shop',
  },
} as const satisfies ErrorCatalog;

export type CampaignErrorCode = keyof typeof CAMPAIGN_ERRORS;

export function campaignError(code: CampaignErrorCode, fields?: ValidationField[]): AppError {
  return new AppError(code, CAMPAIGN_ERRORS[code], fields);
}
