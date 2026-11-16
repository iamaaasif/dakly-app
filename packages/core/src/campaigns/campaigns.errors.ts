import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const CAMPAIGN_ERRORS = {
  CAMPAIGN_NOT_FOUND: { status: 404, message: 'Campaign not found' },
  CAMPAIGN_NOT_DRAFT: { status: 409, message: 'Only a draft campaign can be changed or deleted' },
} as const satisfies ErrorCatalog;

export function campaignError(code: keyof typeof CAMPAIGN_ERRORS): AppError {
  return new AppError(code, CAMPAIGN_ERRORS[code]);
}
