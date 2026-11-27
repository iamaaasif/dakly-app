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
  type BulkExportInput,
  type BulkTagInput,
  type BulkTagResponse,
  bulkExportSchema,
  bulkTagSchema,
  type ContactCountsQuery,
  type ContactCountsResponse,
  type ContactDetailResponse,
  type ContactExportQuery,
  type ContactListQuery,
  type ContactListResponse,
  type ContactResponse,
  type CreateContactInput,
  type UpdateContactInput,
  contactCountsQuerySchema,
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
import { ContactListService } from './contact-list.service';
import { ContactTagsService } from './contact-tags.service';
import { ContactsService } from './contacts.service';

function sendSpreadsheet(
  reply: FastifyReply,
  { filename, type, body, rowCount }: Awaited<ReturnType<ContactExportService['export']>>,
) {
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

@Controller('contacts')
export class ContactsController {
  constructor(
    @Inject(ContactsService) private readonly contactsService: ContactsService,
    @Inject(ContactListService) private readonly listService: ContactListService,
    @Inject(ContactExportService) private readonly exports: ContactExportService,
    @Inject(ContactTagsService) private readonly tags: ContactTagsService,
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
    return this.listService.list(storeId, query, access, { kind: 'user', userId });
  }

  // Declared before `:contactId`, which would otherwise take "counts" "export" or "tags" for an id.
  @Get('counts')
  @RequirePermission('customers.view')
  counts(
    @CurrentStore() storeId: string,
    @Query(new ZodValidationPipe(contactCountsQuerySchema)) query: ContactCountsQuery,
  ): Promise<ContactCountsResponse> {
    return this.listService.counts(storeId, query.hasOrdered);
  }

  // Every tag on the shop's live contacts, for the Contacts tag filter.
  @Get('tags')
  @RequirePermission('customers.view')
  tagsInUse(@CurrentStore() storeId: string): Promise<string[]> {
    return this.tags.inUse(storeId);
  }

  @Get('export')
  @RequirePermission('customers.view')
  async export(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @CurrentAccess() access: StoreAccess,
    @Query(new ZodValidationPipe(contactExportQuerySchema)) query: ContactExportQuery,
    @Res() reply: FastifyReply,
  ) {
    const file = await this.exports.export(storeId, query, access, { kind: 'user', userId });
    return sendSpreadsheet(reply, file);
  }

  // A hand-picked group is up to 100 ids, which is too long for a query string.
  @Post('export-selected')
  @HttpCode(200)
  @RequirePermission('customers.view')
  async exportSelected(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @CurrentAccess() access: StoreAccess,
    @Body(new ZodValidationPipe(bulkExportSchema)) input: BulkExportInput,
    @Res() reply: FastifyReply,
  ) {
    const file = await this.exports.exportSelected(storeId, input, access, {
      kind: 'user',
      userId,
    });
    return sendSpreadsheet(reply, file);
  }

  @Post('bulk-tags')
  @HttpCode(200)
  @RequirePermission('customers.edit')
  addTag(
    @CurrentStore() storeId: string,
    @Body(new ZodValidationPipe(bulkTagSchema)) input: BulkTagInput,
  ): Promise<BulkTagResponse> {
    return this.tags.changeForMany(storeId, input.contactIds, {
      tag: input.tag,
      change: 'add',
    });
  }

  // Undo of Add tag, sent with only the customers the tag was added to.
  @Post('bulk-tags/remove')
  @HttpCode(200)
  @RequirePermission('customers.edit')
  removeTag(
    @CurrentStore() storeId: string,
    @Body(new ZodValidationPipe(bulkTagSchema)) input: BulkTagInput,
  ): Promise<BulkTagResponse> {
    return this.tags.changeForMany(storeId, input.contactIds, {
      tag: input.tag,
      change: 'remove',
    });
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
