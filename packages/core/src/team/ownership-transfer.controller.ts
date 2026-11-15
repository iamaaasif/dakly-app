import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import {
  ownershipTransferCodeSchema,
  startOwnershipTransferSchema,
  acceptOwnershipTransferSchema,
  type OwnershipTransferCodeInput,
  type StartOwnershipTransferInput,
  type AcceptOwnershipTransferInput,
  type OwnershipTransferResponse,
  type CurrentOwnershipTransferResponse,
} from '@dakly/contracts/team';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { AnyMember } from '../platform/tenancy/access.decorators';
import { StoreGuard } from '../platform/tenancy/store.guard';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { OwnershipTransferService } from './ownership-transfer.service';

@Controller('store/ownership-transfer')
@UseGuards(StoreGuard)
export class OwnershipTransferController {
  constructor(
    @Inject(OwnershipTransferService) private readonly transfers: OwnershipTransferService,
  ) {}
  @Post('code')
  @HttpCode(204)
  @AnyMember()
  requestCode(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(ownershipTransferCodeSchema)) input: OwnershipTransferCodeInput,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.transfers.requestCode(storeId, input.membershipId, userId, request.ip);
  }
  @Post()
  @AnyMember()
  start(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(startOwnershipTransferSchema)) input: StartOwnershipTransferInput,
    @Req() request: FastifyRequest,
  ): Promise<OwnershipTransferResponse> {
    return this.transfers.start(storeId, input, userId, request.ip);
  }
  @Get()
  @AnyMember()
  current(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
  ): Promise<CurrentOwnershipTransferResponse> {
    return this.transfers.current(storeId, userId);
  }
  @Delete(':transferId')
  @HttpCode(204)
  @AnyMember()
  cancel(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('transferId', ParseUUIDPipe) transferId: string,
  ): Promise<void> {
    return this.transfers.cancel(storeId, transferId, userId);
  }
  @Post('accept')
  @HttpCode(200)
  @AnyMember()
  accept(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(acceptOwnershipTransferSchema)) input: AcceptOwnershipTransferInput,
  ): Promise<OwnershipTransferResponse> {
    return this.transfers.accept(storeId, input.transferId, userId);
  }
}
