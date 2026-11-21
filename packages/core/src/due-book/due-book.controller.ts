import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';

import {
  type CollectPaymentInput,
  collectPaymentSchema,
  type DueCustomerListQuery,
  type DueCustomerListResponse,
  type DueCustomerResponse,
  type DueHistoryQuery,
  type DueHistoryResponse,
  type DueSummaryResponse,
  dueCustomerListQuerySchema,
  dueHistoryQuerySchema,
  type RecordBakiInput,
  type RecordedDueEntryResponse,
  recordBakiSchema,
  type WriteOffInput,
  writeOffSchema,
} from '@dakly/contracts/due-book';
import type { StoreAccess } from '@dakly/contracts/team';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentAccess } from '../platform/tenancy/current-access.decorator';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { DueBookService } from './due-book.service';

@Controller('due-book')
export class DueBookController {
  constructor(@Inject(DueBookService) private readonly dueBook: DueBookService) {}

  @Get('summary')
  @RequirePermission('dueBook.view')
  summary(@CurrentStore() storeId: string): Promise<DueSummaryResponse> {
    return this.dueBook.summary(storeId);
  }

  @Get('customers')
  @RequirePermission('dueBook.view')
  listCustomers(
    @CurrentStore() storeId: string,
    @CurrentAccess() access: StoreAccess,
    @Query(new ZodValidationPipe(dueCustomerListQuerySchema)) query: DueCustomerListQuery,
  ): Promise<DueCustomerListResponse> {
    return this.dueBook.listCustomers(storeId, query, access);
  }

  @Get('customers/:contactId')
  @RequirePermission('dueBook.view')
  customer(
    @CurrentStore() storeId: string,
    @CurrentAccess() access: StoreAccess,
    @Param('contactId', ParseUUIDPipe) contactId: string,
  ): Promise<DueCustomerResponse> {
    return this.dueBook.customer(storeId, contactId, access);
  }

  @Get('customers/:contactId/entries')
  @RequirePermission('dueBook.view')
  history(
    @CurrentStore() storeId: string,
    @CurrentAccess() access: StoreAccess,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Query(new ZodValidationPipe(dueHistoryQuerySchema)) query: DueHistoryQuery,
  ): Promise<DueHistoryResponse> {
    return this.dueBook.history(storeId, contactId, query, access);
  }

  @Post('customers/:contactId/baki')
  @RequirePermission('dueBook.edit')
  recordBaki(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Body(new ZodValidationPipe(recordBakiSchema)) input: RecordBakiInput,
  ): Promise<RecordedDueEntryResponse> {
    return this.dueBook.recordBaki(storeId, contactId, input, { actor: { kind: 'user', userId } });
  }

  @Post('customers/:contactId/payments')
  @RequirePermission('dueBook.edit')
  collectPayment(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Body(new ZodValidationPipe(collectPaymentSchema)) input: CollectPaymentInput,
  ): Promise<RecordedDueEntryResponse> {
    return this.dueBook.collectPayment(storeId, contactId, input, {
      actor: { kind: 'user', userId },
    });
  }

  @Post('customers/:contactId/write-offs')
  @RequirePermission('dueBook.edit')
  writeOff(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @CurrentAccess() access: StoreAccess,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Body(new ZodValidationPipe(writeOffSchema)) input: WriteOffInput,
  ): Promise<RecordedDueEntryResponse> {
    return this.dueBook.writeOff(storeId, contactId, input, {
      actor: { kind: 'user', userId },
      access,
    });
  }
}
