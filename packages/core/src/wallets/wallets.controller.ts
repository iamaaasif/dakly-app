import { Controller, Get, Inject } from '@nestjs/common';

import type { WalletBalancesResponse } from '@dakly/contracts/wallets';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { WalletService } from './wallet.service';

@Controller('wallets')
export class WalletsController {
  constructor(@Inject(WalletService) private readonly wallets: WalletService) {}

  @Get()
  @RequirePermission('billing.view')
  balances(@CurrentStore() storeId: string): Promise<WalletBalancesResponse> {
    return this.wallets.balances(storeId);
  }
}
