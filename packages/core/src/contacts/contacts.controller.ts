import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import {
  type ContactDetailResponse,
  type ContactListQuery,
  type ContactListResponse,
  type ContactResponse,
  type CreateContactInput,
  type UpdateContactInput,
  contactListQuerySchema,
  createContactSchema,
  updateContactSchema,
} from '@dakly/contracts/contacts';
import type { StoreAccess } from '@dakly/contracts/team';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentAccess } from '../platform/tenancy/current-access.decorator';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { ContactsService } from './contacts.service';

@Controller('contacts')
export class ContactsController {
  constructor(@Inject(ContactsService) private readonly contactsService: ContactsService) {}

  @Post()
  @RequirePermission('customers.edit')
  create(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @CurrentAccess() access: StoreAccess,
    @Body(new ZodValidationPipe(createContactSchema)) input: CreateContactInput,
  ): Promise<ContactResponse> {
    return this.contactsService.create(storeId, input, access, { kind: 'user', userId });
  }

  @Get()
  @RequirePermission('customers.view')
  list(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @CurrentAccess() access: StoreAccess,
    @Query(new ZodValidationPipe(contactListQuerySchema)) query: ContactListQuery,
  ): Promise<ContactListResponse> {
    return this.contactsService.list(storeId, query, access, { kind: 'user', userId });
  }

  @Get(':contactId')
  @RequirePermission('customers.view')
  getById(
    @CurrentStore() storeId: string,
    @CurrentAccess() access: StoreAccess,
    @Param('contactId', ParseUUIDPipe) contactId: string,
  ): Promise<ContactDetailResponse> {
    return this.contactsService.getById(storeId, contactId, access);
  }

  @Patch(':contactId')
  @RequirePermission('customers.edit')
  editDetails(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @CurrentAccess() access: StoreAccess,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Body(new ZodValidationPipe(updateContactSchema)) change: UpdateContactInput,
  ): Promise<ContactResponse> {
    return this.contactsService.editDetails(storeId, contactId, change, {
      access,
      actor: { kind: 'user', userId },
    });
  }

  @Delete(':contactId')
  @RequirePermission('customers.edit')
  @HttpCode(204)
  remove(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
  ): Promise<void> {
    return this.contactsService.remove(storeId, contactId, { kind: 'user', userId });
  }
}
