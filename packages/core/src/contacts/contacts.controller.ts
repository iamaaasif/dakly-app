import { Body, Inject, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';

import {
  type ContactResponse,
  type CreateContactInput,
  createContactSchema,
} from '@dakly/contracts/contacts';
import type { StoreAccess } from '@dakly/contracts/team';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentAccess } from '../platform/tenancy/current-access.decorator';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { ContactsService } from './contacts.service';

@Controller('contacts')
export class ContactsController {
  constructor(@Inject(ContactsService) private readonly contactsService: ContactsService) {}

  @Post()
  @RequirePermission('customers.edit')
  create(
    @CurrentStore() storeId: string,
    @CurrentAccess() access: StoreAccess,
    @Body(new ZodValidationPipe(createContactSchema)) input: CreateContactInput,
  ): Promise<ContactResponse> {
    return this.contactsService.create(storeId, input, access);
  }

  @Get(':contactId')
  @RequirePermission('customers.view')
  getById(
    @CurrentStore() storeId: string,
    @CurrentAccess() access: StoreAccess,
    @Param('contactId', ParseUUIDPipe) contactId: string,
  ): Promise<ContactResponse> {
    return this.contactsService.getById(storeId, contactId, access);
  }
}
