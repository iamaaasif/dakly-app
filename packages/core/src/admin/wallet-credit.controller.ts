import { Body, Controller, Inject, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';

import {
  walletCreditConfirmationSchema,
  walletCreditRequestSchema,
  type WalletCreditConfirmation,
  type WalletCreditPreview,
  type WalletCreditRequest,
  type WalletCreditResponse,
} from '@dakly/contracts/wallets';

import { StaffAccess } from '../platform/tenancy/access.decorators';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import type { StaffRequest } from './staff.guard';
import { walletCreditRoles } from './support-roles';
import { WalletCreditService } from './wallet-credit.service';

@Controller('admin/stores/:storeId/wallet-credits')
@StaffAccess(true, walletCreditRoles)
export class WalletCreditController {
  constructor(@Inject(WalletCreditService) private readonly credits: WalletCreditService) {}

  @Post('preview')
  preview(
    @Req() request: StaffRequest,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Body(new ZodValidationPipe(walletCreditRequestSchema)) input: WalletCreditRequest,
  ): Promise<WalletCreditPreview> {
    return this.credits.preview(request.staff, storeId, input);
  }

  @Post()
  confirm(
    @Req() request: StaffRequest,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Body(new ZodValidationPipe(walletCreditConfirmationSchema)) input: WalletCreditConfirmation,
  ): Promise<WalletCreditResponse> {
    return this.credits.confirm(request.staff, storeId, input, request.ip);
  }
}
