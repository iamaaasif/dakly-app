import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';

import {
  type ContactMergeResponse,
  type MergeContactsInput,
  contactMergeListQuerySchema,
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

  // Merges of this customer that can still be undone.
  @Get()
  @RequirePermission('customers.view')
  list(
    @CurrentStore() storeId: string,
    @Query(new ZodValidationPipe(contactMergeListQuerySchema)) query: { contactId: string },
  ): Promise<ContactMergeResponse[]> {
    return this.merges.listUndoable(storeId, query.contactId);
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
