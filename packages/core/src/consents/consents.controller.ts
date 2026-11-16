import { Body, Controller, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';

import {
  type ConsentResponse,
  type RecordConsentInput,
  recordConsentSchema,
} from '@dakly/contracts/contacts';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { ConsentService } from './consent.service';

@Controller('contacts/:contactId/consents')
export class ConsentsController {
  constructor(@Inject(ConsentService) private readonly consentService: ConsentService) {}

  @Post()
  @RequirePermission('customers.edit')
  record(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Body(new ZodValidationPipe(recordConsentSchema)) input: RecordConsentInput,
  ): Promise<ConsentResponse> {
    return this.consentService.recordStaffAnswer(storeId, contactId, input, {
      kind: 'user',
      userId,
    });
  }
}
