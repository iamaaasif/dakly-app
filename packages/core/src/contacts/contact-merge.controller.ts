import { Body, Controller, HttpCode, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';

import {
  type ContactMergeResponse,
  type MergeContactsInput,
  mergeContactsSchema,
} from '@dakly/contracts/contacts';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { ContactMergeService } from './contact-merge.service';

@Controller('contact-merges')
export class ContactMergeController {
  constructor(@Inject(ContactMergeService) private readonly merges: ContactMergeService) {}

  @Post()
  @RequirePermission('customers.edit')
  @HttpCode(200)
  merge(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(mergeContactsSchema)) input: MergeContactsInput,
  ): Promise<ContactMergeResponse> {
    return this.merges.merge(storeId, userId, input);
  }

  @Post(':mergeId/undo')
  @RequirePermission('customers.edit')
  @HttpCode(200)
  undo(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('mergeId', ParseUUIDPipe) mergeId: string,
  ): Promise<ContactMergeResponse> {
    return this.merges.undo(storeId, userId, mergeId);
  }
}
