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
  Res,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';

import {
  type ContactDetailResponse,
  type ContactExportQuery,
  type ContactListQuery,
  type ContactListResponse,
  type ContactResponse,
  type CreateContactInput,
  type UpdateContactInput,
  contactExportQuerySchema,
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
import { ContactErasureService } from './contact-erasure.service';
import { ContactExportService } from './contact-export.service';
import { ContactsService } from './contacts.service';

@Controller('contacts')
export class ContactsController {
  constructor(
    @Inject(ContactsService) private readonly contactsService: ContactsService,
    @Inject(ContactExportService) private readonly exports: ContactExportService,
    @Inject(ContactErasureService) private readonly erasureService: ContactErasureService,
  ) {}

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

  // Declared before `:contactId`, which would otherwise take "export" for an id.
  @Get('export')
  @RequirePermission('customers.view')
  async export(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @CurrentAccess() access: StoreAccess,
    @Query(new ZodValidationPipe(contactExportQuerySchema)) query: ContactExportQuery,
    @Res() reply: FastifyReply,
  ) {
    const { filename, type, body, rowCount } = await this.exports.export(storeId, query, access, {
      kind: 'user',
      userId,
    });
    return (
      reply
        .header('Cache-Control', 'no-store')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        // The screen says how many customers are in the file.
        .header('X-Row-Count', String(rowCount))
        .type(type)
        .send(body)
    );
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

  @Post(':contactId/erase')
  @RequirePermission('customers.edit')
  @HttpCode(204)
  erase(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @CurrentAccess() access: StoreAccess,
    @Param('contactId', ParseUUIDPipe) contactId: string,
  ): Promise<void> {
    return this.erasureService.erase(storeId, contactId, access, { kind: 'user', userId });
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
